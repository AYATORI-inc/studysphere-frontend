import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

/** コードがHTMLとして解釈できそうか簡易判定（言語未指定ブロック用） */
const looksLikeHtml = (s) => {
  const t = String(s).trim();
  if (!t) return false;
  return (
    /<!DOCTYPE\s+html/i.test(t) ||
    /^<html[\s>]/i.test(t) ||
    (/<\w+[\s/>]/.test(t) && /<\/\w+>/.test(t)) ||
    /<!--[\s\S]*-->/.test(t)
  );
};

const codeBlockStyle = {
  margin: 0,
  padding: '1rem',
  borderRadius: '0.5rem',
  overflow: 'auto',
  marginBottom: '1rem',
  fontSize: '0.875rem'
};

/** 全角アスタリスク（＊ U+FF0A）を半角（*）に変換。パーサーは半角の ** しか strong として解釈しない */
const normalizeAsterisks = (text) => {
  if (!text || typeof text !== 'string') return text;
  return String(text).replace(/\uFF0A/g, '*');
};

/**
 * 見出し用の # を正規化する。
 * - 全角シャープ（＃ U+FF03）→ 半角 #
 * - # の後の全角スペース（　 U+3000）→ 半角スペース（CommonMark/remark は \s に全角スペースを含まない）
 * - ####5-1 のように # と見出しの間にスペースがない場合 → スペースを挿入
 */
const normalizeHashes = (text) => {
  if (!text || typeof text !== 'string') return text;
  let t = String(text).replace(/\uFF03/g, '#');
  // # の直後の全角スペースを半角に（行頭の # に限定して安全に）
  t = t.replace(/(^|\n)(#{1,6})\u3000+/gm, '$1$2 ');
  // # の直後にスペースなしで非空白文字（例: ####5-1）→ スペースを挿入
  t = t.replace(/(^|\n)(#{1,6})([^\s#\n])/gm, '$1$2 $3');
  return t;
};

/** CommonMarkでは ** と文字の間にスペースがあると太字にならないため、前処理で正規化する */
const normalizeBoldDelimiters = (text) => {
  if (!text || typeof text !== 'string') return text;
  let t = normalizeAsterisks(text);
  // 半角・全角スペースのみ削除（改行は残す。\s だと \n も消えて段落が繋がる）
  t = t.replace(/\*\*[ \t\u3000]+/g, '**').replace(/[ \t\u3000]+\*\*/g, '**');
  return t;
};

/**
 * サーバー取得MDでコードフェンス（```）が認識されない問題への対処。
 * - BOM除去、改行の正規化
 * - バッククォート類似のUnicode文字をASCII ` に統一
 * - ''' を ``` に置換
 */
const normalizeCodeFences = (text) => {
  if (!text || typeof text !== 'string') return text;
  let t = text;
  // BOM・ゼロ幅文字等の除去（サーバー由来で混入することがある）
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  t = t.replace(/[\u200B\u200C\u200D\uFEFF]/g, ''); // ゼロ幅スペース等
  // 改行を \n に統一（remark は \n を前提とする）
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // バッククォート類似文字をASCII ` に統一（全角｀、スマートクォート等）
  t = t.replace(/[\u02BB\u02BC\u02B9\u02BD\u02C8\u02CB\u02F4\u2018\u2019\u2032\u2033\u2035\uFF40]/g, '`');
  // 閉じフェンス：行が ''' だけ → ```
  t = t.replace(/(^|\n)'''\s*(\n|$)/g, '$1```\n$2');
  // 開きフェンス：'''（例: '''html）→ ```
  t = t.replace(/(^|\n)'''/g, '$1```');
  return t;
};

/**
 * 未閉じの ``` コードブロックを検出し、HTML閉じタグの直後に ``` を挿入する。
 * </html>, </body>, </main>, </section>, </footer> 等の直後に
 * 見出し（####）や番号リスト（4.）が続くが閉じ ``` がない場合に挿入。
 */
const forceCloseHtmlBlockBeforeMarkdown = (text) => {
  if (!text || typeof text !== 'string') return text;
  const htmlCloseTag = '<\\/(?:html|body|main|section|footer|header|article|nav|style|script)>';
  // 閉じタグ + 1行以上の改行 + 見出し/番号リスト（間に ``` が無い場合のみ）
  const fence = '\\x60\\x60\\x60'; // ``` の正規表現用エスケープ
  const re1 = new RegExp(
    '(' + htmlCloseTag + ')((?:[ \\t]*\\r?\\n)+)((?!\\s*' + fence + ')[ \\t]*(?:#{1,6}\\s|\\d+\\.\\s+)[^\\n]*)',
    'gi'
  );
  let t = text.replace(re1, (_, tag, newlines, mdLine) => {
    if (newlines.includes('```')) return tag + newlines + mdLine;
    return tag + newlines + '```\n\n' + mdLine;
  });
  // 閉じタグ直後（改行なし、または空白のみ）にマークダウンが続く場合
  const re2 = new RegExp(
    `(${htmlCloseTag})([ \\t]*)((?:(?:#{1,6}\\s|\\d+\\.\\s+)[^\\n]*))`,
    'gi'
  );
  t = t.replace(re2, (_, tag, sp, mdLine) => {
    if (sp.includes('\n') || sp.includes('`')) return tag + sp + mdLine;
    return tag + '\n```\n\n' + mdLine;
  });
  return t;
};

/**
 * 閉じ忘れた ``` や ```html の直後から見出し・表・リストまでがコード扱いになるのを防ぐ。
 * 見出し（行頭の #{1,6}）、番号付きリスト（行頭の 1. 2. 等）、箇条書き（行頭の - * +）、
 * 表の行（行頭の |）の直前に閉じフェンスを挿入する。
 *
 * 重要: すでに閉じているブロックには挿入しない。
 * [\s\S]*? で「閉じフェンス（\n```）を含まない」範囲に制限することで、
 * 閉じ済みブロックの後に余計な ``` を挿入して後半の見出し・表がコード扱いになるバグを防止。
 */
const closeUnclosedFencedBlocks = (text) => {
  if (!text || typeof text !== 'string') return text;
  let t = text;
  // 閉じフェンスを含まない範囲のみマッチ（負の先読み）
  const noCloseFence = '(?:(?!\\r?\\n```\\s*(?:\\r?\\n|$))[\\s\\S])';
  // ``` または ```html / ```xml 等 任意の言語指定（[\w-]*）に対応
  const openFence = '(\`\`\`[\\w-]*\\s*\\r?\\n)';
  // 開きフェンス → （閉じフェンスを含まない）→ 番号付きリスト（4. ブロック要素... 等）のとき挿入
  t = t.replace(
    new RegExp(`${openFence}(${noCloseFence}*?)(\\r?\\n\\s*\\d+\\.\\s+[^\\n]*)`, 'g'),
    '$1$2\n```\n$3'
  );
  // 開きフェンス → （閉じフェンスを含まない）→ 箇条書き（- * +）のとき挿入
  t = t.replace(
    new RegExp(`${openFence}(${noCloseFence}*?)(\\r?\\n\\s*[-*+]\\s+[^\\n]*)`, 'g'),
    '$1$2\n```\n$3'
  );
  // 開きフェンス → （閉じフェンスを含まない）→ 見出し のときのみ挿入
  t = t.replace(
    new RegExp(`${openFence}(${noCloseFence}*?)(\\r?\\n\\s*#{1,6}\\s[^\\n]*)`, 'g'),
    '$1$2\n```\n$3'
  );
  // 開きフェンス → （閉じフェンスを含まない）→ 表の行 のときのみ挿入
  t = t.replace(
    new RegExp(`${openFence}(${noCloseFence}*?)(\\r?\\n\\s*\\|[^\\n]+)`, 'g'),
    '$1$2\n```\n$3'
  );
  // すでに閉じられていた場合に ``` が連続するので、連続を1つに
  t = t.replace(/\n```\s*\n```\n/g, '\n```\n');
  return t;
};

/**
 * ドキュメント末尾に未閉じのコードブロックがあれば閉じる。
 * 行頭の ``` を数えて奇数なら未閉じと判断し、末尾に ``` を追加。
 */
const balanceFinalFencedBlocks = (text) => {
  if (!text || typeof text !== 'string') return text;
  const lines = text.split(/\r?\n/);
  let fenceCount = 0;
  for (const line of lines) {
    if (/^```[\w-]*\s*$/.test(line.trim())) fenceCount += 1;
  }
  if (fenceCount % 2 === 1) {
    return text.replace(/\s*$/, '\n\n```\n');
  }
  return text;
};

/**
 * フェンス付きコードブロック直後に見出し・番号付きリスト・箇条書きが直続していると、
 * パーサーがコードブロック継続と誤認してプレーン表示になることがある。
 * 閉じフェンスの直後に空行を挿入して確実にブロックを区切る。
 */
const ensureBlankLineAfterCodeBlock = (text) => {
  if (!text || typeof text !== 'string') return text;
  let t = text;
  // 閉じ ``` の直後、空行なしで見出し・番号付きリスト・箇条書きが続く場合に空行を挿入
  t = t.replace(/(\r?\n```\s*\r?\n)(\s*#{1,6}\s)/g, '$1\n$2');
  t = t.replace(/(\r?\n```\s*\r?\n)(\s*\d+\.\s+)/g, '$1\n$2');
  t = t.replace(/(\r?\n```\s*\r?\n)(\s*[-*+]\s+)/g, '$1\n$2');
  t = t.replace(/(\r?\n```\s*\r?\n)(\s*\|[^|]*\|)/g, '$1\n$2');
  return t;
};

/**
 * 行頭のスペース・タブはCommonMarkで「インデント付きコードブロック」扱いになり、#### が見出しとして解釈されない。
 * 見出し行（#{1,6} の行）の先頭の余分なインデントを除去。
 */
const stripLeadingSpacesFromHeadings = (text) => {
  if (!text || typeof text !== 'string') return text;
  return String(text).replace(/(^|\r?\n)([ \t]+)(#{1,6}\s[^\n]*)/gm, '$1$3');
};

/**
 * 表の行が改行なしで連結されている（|...||...|）場合に改行を挿入し、GFM表としてパースされるようにする。
 * パイプが6本以上ある行（＝2行分以上）かつ || を含む場合のみ置換し、通常のセル区切りは触らない。
 */
const ensureTableLineBreaks = (text) => {
  if (!text || typeof text !== 'string') return text;
  return String(text).split('\n').map((line) => {
    const pipeCount = (line.match(/\|/g) || []).length;
    if (pipeCount >= 6 && line.includes('||')) {
      return line.replace(/\|\s*\|/g, '|\n|');
    }
    return line;
  }).join('\n');
};

/**
 * 未閉じコードブロックを確実に閉じる（行単位スキャン）。
 * 開き ``` があり、その後にマークダウン風の行（見出し・リスト・表）があれば閉じる。
 * HTML/CSS/JS閉じタグ（</html>, </style>等）の後、または表の行で特に検出。
 */
const closeCodeBlocksByLineScan = (text) => {
  if (!text || typeof text !== 'string') return text;
  const lines = text.split(/\r?\n/);
  let inFencedBlock = false;
  let lastBlockCloseLine = -1; // HTML/style/script 閉じタグまたは } で終わる行
  const result = [];
  const mdLikeLine = /^\s*((?:[#＃]{1,6}\s)|(?:[0-9０-９]+[．.]\s)|(?:[-*+]\s)|(?:\|[^|]*\|))/;
  const htmlCloseTag = /<\/(?:html|body|main|section|footer|header|article|nav|style|script)>/i;
  const cssBlockEnd = /}\s*$/;  // 行末の }（CSSブロックの終わり）
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^```[\w-]*\s*$/.test(trimmed)) {
      if (inFencedBlock) {
        inFencedBlock = false;
      } else {
        inFencedBlock = true;
      }
      result.push(line);
      continue;
    }
    if (htmlCloseTag.test(line) || (inFencedBlock && cssBlockEnd.test(line))) {
      lastBlockCloseLine = i;
    }
    const isTableRow = /^\s*\|[^|]*\|/.test(line);
    const isMdLike = mdLikeLine.test(line);
    const afterBlockClose = lastBlockCloseLine >= 0 && i > lastBlockCloseLine;
    if (inFencedBlock && trimmed !== '') {
      const shouldClose = isTableRow || (isMdLike && afterBlockClose);
      if (shouldClose) {
        result.push('```');
        result.push('');
        inFencedBlock = false;
        lastBlockCloseLine = -1;
      }
    }
    result.push(line);
  }
  if (inFencedBlock) {
    result.push('');
    result.push('```');
  }
  return result.join('\n');
};

/** 見出し・太字・表・コードブロックが正しくパースされるよう正規化する */
const normalizeMarkdownDelimiters = (text) => {
  if (!text || typeof text !== 'string') return text;
  let t = String(text);
  t = normalizeCodeFences(t);  // ''' → ```、改行・バッククォート正規化
  t = forceCloseHtmlBlockBeforeMarkdown(t);  // </html>直後に見出しが続く場合の強制閉じ
  t = normalizeHashes(normalizeBoldDelimiters(t));
  t = stripLeadingSpacesFromHeadings(t);  // 見出しのインデント除去
  t = closeUnclosedFencedBlocks(t);
  t = closeCodeBlocksByLineScan(t);  // 行スキャンで未閉じブロックを確実に閉じる
  t = ensureBlankLineAfterCodeBlock(t);
  t = ensureTableLineBreaks(t);
  t = balanceFinalFencedBlocks(t);
  return t;
};

/**
 * 文字列中の **...** を strong と text のノード配列に展開する（再帰で複数 ** に対応）
 */
function expandTextWithStrong(value) {
  if (typeof value !== 'string') return [];
  if (!value.includes('**')) return value === '' ? [] : [{ type: 'text', value }];
  const parts = value.split('**');
  const nodes = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (parts[i] !== '') nodes.push(...expandTextWithStrong(parts[i]));
    } else {
      nodes.push({ type: 'strong', children: [{ type: 'text', value: parts[i] }] });
    }
  }
  return nodes;
}

/**
 * コードブロック内に誤って含まれた見出し・番号付きリスト・箇条書きを検出し、
 * コード部分とMarkdown部分に分割して正しくレンダリングする。
 * 「HTMLに色づけした次の章がプレーンのまま」になる問題へのフォールバック。
 */
function remarkSplitCodeBlockWithHeadings() {
  const processor = unified().use(remarkParse).use(remarkGfm);
  // 空白行を挟む場合にも対応。全角数字・全角# にも対応。表（|...|）も追加
  const patterns = [
    /\r?\n[\s\r\n]*([#＃]{1,6}\s[^\n]+)/,           // 見出し
    /\r?\n[\s\r\n]*([0-9０-９]+[．.]\s+[^\n]+)/,   // 番号付きリスト
    /\r?\n[\s\r\n]*([-*+]\s+[^\n]+)/,               // 箇条書き
    /\r?\n[\s\r\n]*(\|[^|\n]+\|)/                   // GFM表の行（| 項目 | 値 |）
  ];
  return (tree) => {
    const toReplace = [];
    visit(tree, (node, index, parent) => {
      if (!parent || node.type !== 'code' || typeof node.value !== 'string') return;
      const lang = (node.lang || '').toString().toLowerCase();
      const val = node.value;
      const hasHtml = /<\/html>|<\/body>|<\/section>/i.test(val);
      const hasTable = /\|[^|]*\|/.test(val);
      const isHtmlBlock = lang === 'html' || (!lang && hasHtml);
      const isCssBlock = lang === 'css' || lang === 'scss' || lang === 'less';
      const isBlockWithMarkdown = isHtmlBlock || hasTable || isCssBlock;
      if (!isBlockWithMarkdown) return;
      // 最初に現れるマークダウン風の行を探す
      let earliest = -1;
      let matched = null;
      for (const re of patterns) {
        const m = val.match(re);
        if (m) {
          const idx = val.indexOf(m[0]);
          if (idx !== -1 && (earliest === -1 || idx < earliest)) {
            earliest = idx;
            matched = m;
          }
        }
      }
      if (!matched || earliest === -1) return;
      const splitAt = earliest;
      const codePart = val.slice(0, splitAt).replace(/\r?\n$/, '');
      let mdPart = val.slice(splitAt).replace(/^\r?\n+/, '');
      if (!mdPart.trim()) return;
      // 全角#・数字を半角に正規化（パーサーが正しく解釈するため）
      mdPart = mdPart.replace(/[＃#]/g, (c) => (c === '＃' ? '#' : c));
      mdPart = mdPart.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      mdPart = mdPart.replace(/[．]/g, '.');
      try {
        const mdTree = processor.parse(mdPart);
        const children = mdTree.children || [];
        if (children.length === 0) return;
        toReplace.push({ parent, index, codePart, mdChildren: children });
      } catch {
        return;
      }
    });
    toReplace.reverse().forEach(({ parent, index, codePart, mdChildren }) => {
      const codeNode = parent.children[index];
      codeNode.value = codePart;
      parent.children.splice(index + 1, 0, ...mdChildren);
    });
  };
}

/**
 * paragraph 内に誤って含まれた code（ブロック）を外に出す。
 * <pre> が <p> の子孫になる validateDOMNesting エラーを防ぐ。
 */
function remarkUnwrapCodeFromParagraph() {
  return (tree) => {
    const toModify = [];
    visit(tree, (node, index, parent) => {
      if (node.type !== 'paragraph' || !parent) return;
      const codeIdx = node.children?.findIndex((c) => c.type === 'code');
      if (codeIdx >= 0) toModify.push({ paragraph: node, pIndex: index, parent, codeIdx });
    });
    toModify.reverse().forEach(({ paragraph, pIndex, parent, codeIdx }) => {
      const codeNode = paragraph.children[codeIdx];
      paragraph.children.splice(codeIdx, 1);
      if (paragraph.children.length === 0) {
        parent.children.splice(pIndex, 1, codeNode);
      } else {
        parent.children.splice(pIndex + 1, 0, codeNode);
      }
    });
  };
}

/** 要素またはその子孫に block 要素（pre, div）が含まれるか */
function hasBlockDescendant(node) {
  if (!node || node.type !== 'element') return false;
  if (node.tagName === 'pre' || node.tagName === 'div') return true;
  if (Array.isArray(node.children)) {
    return node.children.some((c) => hasBlockDescendant(c));
  }
  return false;
}

/**
 * HAST段階で <p> 内の <pre> や <div> を外に出す rehype プラグイン。
 * ネストした場合も再帰的に検出し、validateDOMNesting エラーを防ぐ。
 */
function rehypeUnwrapPreFromP() {
  return (tree) => {
    const toModify = [];
    visit(tree, (node, index, parent) => {
      if (!parent || index == null) return;
      if (node.type === 'element' && node.tagName === 'p' && Array.isArray(node.children)) {
        const blockIndices = [];
        node.children.forEach((child, i) => {
          if (child.type === 'element' && hasBlockDescendant(child)) {
            blockIndices.push(i);
          }
        });
        if (blockIndices.length > 0) {
          const blocks = blockIndices.map((i) => node.children[i]);
          [...blockIndices].reverse().forEach((i) => node.children.splice(i, 1));
          toModify.push({ pIndex: index, parent, blocks });
        }
      }
    });
    toModify.reverse().forEach(({ pIndex, parent, blocks }) => {
      blocks.forEach((block, i) => {
        parent.children.splice(pIndex + 1 + i, 0, block);
      });
    });
  };
}

/**
 * パース後も ** がそのまま残っているテキストを <strong> に変換する remark プラグイン。
 * パーサーが ** を解釈しない場合（全角・エスケープ等）のフォールバック。
 */
function remarkStrongFallback() {
  return (tree) => {
    visit(tree, (node) => {
      if (!node.children) return;
      const newChildren = [];
      for (const child of node.children) {
        if (child.type !== 'text' || typeof child.value !== 'string' || !child.value.includes('**')) {
          newChildren.push(child);
          continue;
        }
        newChildren.push(...expandTextWithStrong(child.value));
      }
      node.children = newChildren;
    });
  };
}

const MarkdownRenderer = ({ content, showToc = true, scrollContainerRef }) => {
  const [headings, setHeadings] = useState([]);
  const [activeHeading, setActiveHeading] = useState('');
  const normalizedContent = normalizeMarkdownDelimiters(content);

  // 見出しを抽出する関数
  const extractHeadings = (markdownContent) => {
    const headingRegex = /^(#{1,6})\s+(.+?)(?:\s*\{#([^}]+)\})?\s*$/gm;
    const extractedHeadings = [];
    let match;

    while ((match = headingRegex.exec(markdownContent)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const customId = match[3];
      const id = customId || generateId(text);
      
      extractedHeadings.push({
        level,
        text,
        id,
        customId: !!customId
      });
    }
    
    return extractedHeadings;
  };

  // アクティブな見出しを監視する
  useEffect(() => {
    if (!showToc || headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveHeading(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-20% 0px -70% 0px',
        threshold: 0
      }
    );

    headings.forEach((heading) => {
      const element = document.getElementById(heading.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [headings, showToc]);

  // コンテンツが変更されたときに見出しを抽出（正規化後のテキストを使用）
  useEffect(() => {
    if (normalizedContent) {
      const extractedHeadings = extractHeadings(normalizedContent);
      setHeadings(extractedHeadings);
    }
  }, [normalizedContent]);

  // 見出しのIDを生成する関数
  // 目次リンク（例: #第1章-日常でのai活用例, #第2章aiツールの体験）と一致する形式で生成
  const generateId = (text) => {
    if (!text) return '';
    
    // childrenが配列の場合（例: ["第1章 ", "日常でのAI活用例"]）は結合
    const textStr = Array.isArray(text)
      ? text.map(t => (typeof t === 'string' ? t : '')).join('')
      : text.toString();
    
    // Markdownの {#id} 形式をチェック（明示指定があればそれを優先）
    const idMatch = textStr.match(/\{#([^}]+)\}$/);
    if (idMatch) {
      return idMatch[1];
    }
    
    // 目次リンク形式に合わせる: スペース→ハイフン、英大文字→小文字、区切り記号を除去
    // 数字は半角に統一（全角数字があるとアンカーが効かない場合がある）
    return textStr
      .trim()
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) // 全角数字→半角
      .replace(/[・．。、]/g, '') // 中黒・句読点を除去（リンク形式に合わせる）
      .replace(/\s*[：:]\s*/g, '') // 全角・半角コロンを除去
      .replace(/\s+/g, '-') // スペースをハイフンに変換
      .replace(/[Ａ-Ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)) // 全角英字→半角
      .replace(/[ａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .toLowerCase() // 英字を小文字に
      .replace(/-+/g, '-') // 連続ハイフンを1つに
      .replace(/^-|-$/g, '') // 先頭・末尾のハイフンを削除
      || 'section-' + Math.random().toString(36).substr(2, 9); // フォールバック
  };

  // 要素からスクロール可能な親を探索
  const findScrollParent = (el) => {
    let parent = el?.parentElement;
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent);
      const overflowY = style.overflowY;
      const overflow = style.overflow;
      if (overflowY === 'auto' || overflowY === 'scroll' || overflow === 'auto' || overflow === 'scroll') {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  };

  // スムーススクロール関数（スクロールコンテナ内の場合はそのコンテナをスクロール）
  // アンカーIDの全角数字を半角に正規化（リンク先と見出しIDの一致用）
  const normalizeAnchorId = (str) =>
    String(str).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

  const scrollToHeading = (id) => {
    const rawId = typeof id === 'string' ? id : '';
    const decodedId = (() => {
      try {
        return decodeURIComponent(rawId);
      } catch {
        return rawId;
      }
    })();
    const normalizedId = normalizeAnchorId(decodedId);
    const element =
      document.getElementById(decodedId) ||
      document.getElementById(normalizedId) ||
      document.getElementById(rawId);
    if (!element) return;

    const container = scrollContainerRef?.current ?? findScrollParent(element);
    if (container && container.contains(element)) {
      requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top + container.scrollTop;
        const scrollMargin = 80;
        container.scrollTo({
          top: Math.max(0, relativeTop - scrollMargin),
          behavior: 'smooth'
        });
      });
    } else {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 目次コンポーネント
  const TableOfContents = () => {
    if (!showToc || headings.length === 0) return null;

    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          目次
        </h3>
        <nav className="space-y-1">
          {headings.map((heading, index) => (
            <button
              key={index}
              onClick={() => scrollToHeading(heading.id)}
              className={`block w-full text-left px-3 py-2 rounded-md text-sm transition-colors duration-200 ${
                activeHeading === heading.id
                  ? 'bg-blue-100 text-blue-800 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
              }`}
              style={{ paddingLeft: `${(heading.level - 1) * 16 + 12}px` }}
            >
              {heading.text}
            </button>
          ))}
        </nav>
      </div>
    );
  };

  return (
    <div className="markdown-content">
      <TableOfContents />
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkSplitCodeBlockWithHeadings, remarkUnwrapCodeFromParagraph, remarkStrongFallback]}
      rehypePlugins={[rehypeUnwrapPreFromP]}
      components={{
        h1: ({ children, ...props }) => {
          const id = generateId(children);
          // {#id}部分を除去したテキストを表示
          const displayText = Array.isArray(children) 
            ? children.map(child => 
                typeof child === 'string' 
                  ? child.replace(/\s*\{#[^}]+\}\s*$/, '') 
                  : child
              )
            : typeof children === 'string' 
              ? children.replace(/\s*\{#[^}]+\}\s*$/, '') 
              : children;
          
          return (
            <h1 
              id={id} 
              className="text-3xl font-bold text-gray-800 mt-8 mb-4 pb-2 border-b-2 border-blue-200 scroll-mt-20 group relative"
              {...props}
            >
              {displayText}
              <button
                onClick={() => scrollToHeading(id)}
                className="opacity-0 group-hover:opacity-100 ml-2 text-blue-500 hover:text-blue-700 transition-opacity duration-200"
                title="この見出しへのリンクをコピー"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>
            </h1>
          );
        },
        h2: ({ children, ...props }) => {
          const id = generateId(children);
          // {#id}部分を除去したテキストを表示
          const displayText = Array.isArray(children) 
            ? children.map(child => 
                typeof child === 'string' 
                  ? child.replace(/\s*\{#[^}]+\}\s*$/, '') 
                  : child
              )
            : typeof children === 'string' 
              ? children.replace(/\s*\{#[^}]+\}\s*$/, '') 
              : children;
          
          return (
            <h2 
              id={id} 
              className="text-2xl font-bold text-gray-700 mt-6 mb-3 pb-1 border-b border-blue-100 scroll-mt-16 group relative"
              {...props}
            >
              {displayText}
              <button
                onClick={() => scrollToHeading(id)}
                className="opacity-0 group-hover:opacity-100 ml-2 text-blue-500 hover:text-blue-700 transition-opacity duration-200"
                title="この見出しへのリンクをコピー"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>
            </h2>
          );
        },
        h3: ({ children, ...props }) => {
          const id = generateId(children);
          // {#id}部分を除去したテキストを表示
          const displayText = Array.isArray(children) 
            ? children.map(child => 
                typeof child === 'string' 
                  ? child.replace(/\s*\{#[^}]+\}\s*$/, '') 
                  : child
              )
            : typeof children === 'string' 
              ? children.replace(/\s*\{#[^}]+\}\s*$/, '') 
              : children;
          
          return (
            <h3 
              id={id} 
              className="text-xl font-semibold text-gray-700 mt-4 mb-2 scroll-mt-12 group relative"
              {...props}
            >
              {displayText}
              <button
                onClick={() => scrollToHeading(id)}
                className="opacity-0 group-hover:opacity-100 ml-2 text-blue-500 hover:text-blue-700 transition-opacity duration-200"
                title="この見出しへのリンクをコピー"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>
            </h3>
          );
        },
        strong: ({ children, ...props }) => (
          <strong className="font-bold" style={{ fontWeight: 700 }} {...props}>
            {children}
          </strong>
        ),
        p: ({ children, ...props }) => {
          // <pre>/<div> を <p> 内に入れると validateDOMNesting エラーになる。
          // ブロック要素（div, pre, SyntaxHighlighter 等）を検出したら div で包みブロックを外に出す
          const isBlockElement = (el) => {
            if (!React.isValidElement(el)) return false;
            const t = el.type;
            if (t === 'pre' || t === 'div' || t === 'table' || t === 'ul' || t === 'ol') return true;
            if (typeof t === 'function') {
              const name = t.displayName || t.name || '';
              // コードブロック用コンポーネントのみブロック扱い。strong/em 等のインラインはブロックにしない
              if (/SyntaxHighlighter|Prism|Highlight/i.test(name)) return true;
              return false;
            }
            if (t === React.Fragment) {
              return React.Children.toArray(el.props?.children || []).some((c) => isBlockElement(c));
            }
            return false;
          };
          const childArray = React.Children.toArray(children);
          const blocks = [];
          const inlines = [];
          childArray.forEach((child) => {
            if (isBlockElement(child)) {
              blocks.push(child);
            } else {
              inlines.push(child);
            }
          });
          if (blocks.length === 0) {
            return (
              <p className="text-gray-700 leading-relaxed mb-4" {...props}>
                {children}
              </p>
            );
          }
          return (
            <div className="mb-4" data-md-block-wrapper>
              {inlines.length > 0 && (
                <p className="text-gray-700 leading-relaxed mb-4" {...props}>
                  {inlines}
                </p>
              )}
              {blocks}
            </div>
          );
        },
        pre: ({ children, ...props }) => {
          // pre の子が code コンポーネント由来（div/SyntaxHighlighter）の場合、
          // pre で包むと pre>div の不正ネストになる。子をそのまま返す。
          const firstChild = React.Children.toArray(children)[0];
          if (React.isValidElement(firstChild) && (
            firstChild.type === 'div' ||
            (typeof firstChild.type === 'function' && /SyntaxHighlighter|Prism|Highlight/i.test(firstChild.type?.displayName || firstChild.type?.name || ''))
          )) {
            return <>{children}</>;
          }
          return <pre {...props}>{children}</pre>;
        },
        ul: ({ children, ...props }) => (
          <ul className="list-disc list-inside text-gray-700 mb-4 space-y-1" {...props}>
            {children}
          </ul>
        ),
        ol: ({ children, ...props }) => (
          <ol className="list-decimal list-inside text-gray-700 mb-4 space-y-1" {...props}>
            {children}
          </ol>
        ),
        li: ({ children, ...props }) => (
          <li className="ml-4" {...props}>
            {children}
          </li>
        ),
        blockquote: ({ children, ...props }) => (
          <blockquote className="border-l-4 border-blue-500 pl-4 py-2 bg-blue-50 text-gray-700 italic mb-4" {...props}>
            {children}
          </blockquote>
        ),
        code: ({ inline, className, children, ...props }) => {
          const match = /language-([\w-]+)/.exec(className ?? '');
          const codeString = String(children).replace(/\n$/, '');
          const lang = match ? match[1] : (looksLikeHtml(codeString) ? 'html' : null);

          // フェンス付きコードブロック（```html など）または言語未指定でHTMLと判定→ シンタックスハイライト
          if (!inline && lang) {
            return (
              <SyntaxHighlighter
                language={lang}
                style={oneLight}
                PreTag="div"
                customStyle={codeBlockStyle}
                codeTagProps={{ style: { fontFamily: 'ui-monospace, monospace' } }}
                showLineNumbers={false}
              >
                {codeString}
              </SyntaxHighlighter>
            );
          }
          // 言語未指定のブロック（HTMLでない）→ グレー枠のプレーン表示
          // pre は p 内に入れられないため div を使用（validateDOMNesting エラー対策）
          if (!inline) {
            return (
              <div className="bg-gray-100 p-4 rounded-lg overflow-x-auto mb-4 font-mono text-sm whitespace-pre-wrap">
                <code className="text-gray-800" {...props}>
                  {children}
                </code>
              </div>
            );
          }
          // インラインコード
          return (
            <code className="bg-gray-200 px-2 py-1 rounded text-sm font-mono" {...props}>
              {children}
            </code>
          );
        },
        table: ({ children, ...props }) => (
          <div className="overflow-x-auto mb-4">
            <table className="markdown-table-zebra min-w-full border border-gray-300" {...props}>
              {children}
            </table>
          </div>
        ),
        th: ({ children, ...props }) => (
          <th className="border border-gray-300 px-4 py-2 bg-gray-100 font-semibold text-left" {...props}>
            {children}
          </th>
        ),
        td: ({ children, ...props }) => (
          <td className="border border-gray-300 px-4 py-2" {...props}>
            {children}
          </td>
        ),
        a: ({ children, href, ...props }) => {
          // ページ内アンカーリンクかどうかを判定
          const isInternalAnchor = href && (href.startsWith('#') || href.includes('#'));
          let displayHref = href;
          let anchorId = '';
          if (isInternalAnchor) {
            const hashPart = href.includes('#') ? href.split('#')[1] || '' : href.replace(/^#/, '');
            try {
              anchorId = decodeURIComponent(hashPart);
              displayHref = '#' + anchorId;
            } catch {
              anchorId = hashPart;
            }
          }
          
          return (
            <a 
              {...props}
              href={isInternalAnchor ? displayHref : href}
              className="text-blue-600 hover:text-blue-800 underline" 
              target={isInternalAnchor ? undefined : "_blank"}
              rel={isInternalAnchor ? undefined : "noopener noreferrer"}
              onClick={isInternalAnchor ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                scrollToHeading(anchorId || displayHref.replace(/^#/, ''));
              } : undefined}
            >
              {children}
            </a>
          );
        },
        img: ({ src, alt, ...props }) => (
          <img 
            src={src} 
            alt={alt} 
            className="max-w-full h-auto rounded-lg shadow-md my-4" 
            {...props}
          />
        )
      }}
    >
      {normalizedContent}
    </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;

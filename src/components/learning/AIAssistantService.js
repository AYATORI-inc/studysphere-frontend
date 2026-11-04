import { API_BASE_URL } from '../../config/apiConfig';

// AIアシスタントサービス - GPT-4oモデルを使用
class AIAssistantService {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.apiKey = process.env.REACT_APP_OPENAI_API_KEY;
  }

  // GPT-4oモデルを使用して質問に回答
  async askQuestion(question, contextText, lessonTitle, conversationHistory = []) {
    try {
      // コンテキストを適切な長さに制限（GPT-4oの制限を考慮）
      const maxContextLength = 40000;
      const truncatedContext = contextText.length > maxContextLength 
        ? contextText.substring(0, maxContextLength) + '...'
        : contextText;

      // 会話履歴をOpenAI API形式に変換（最新10往復まで）
      const formattedHistory = this.formatConversationHistory(conversationHistory);

      const prompt = this.buildPrompt(question, truncatedContext, lessonTitle);
      
      const response = await fetch(`${this.baseURL}/api/ai/assist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          question,
          context: truncatedContext,
          lessonTitle,
          model: 'gpt-4o',
          maxTokens: 2000, // 詳細な説明と例を含めるため増加
          temperature: 0.6, // 適度な温度で柔軟性と正確性のバランスを取る
          systemPrompt: this.getSystemPrompt(),
          conversationHistory: formattedHistory
        })
      });

      if (!response.ok) {
        throw new Error(`AI API呼び出しエラー: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        return {
          success: true,
          answer: data.answer,
          summary: data.summary || '', // 会話履歴用の要約
          usage: data.usage
        };
      } else {
        throw new Error(data.message || 'AIからの回答を取得できませんでした');
      }
    } catch (error) {
      console.error('AIアシスタントエラー:', error);
      return {
        success: false,
        error: error.message,
        fallbackAnswer: this.getFallbackAnswer(question)
      };
    }
  }

  // システムプロンプトを構築
  getSystemPrompt() {
    return `あなたは学習支援AIアシスタントです。以下の指示に厳密に従ってください：

1. **中学生レベルの語彙で説明**: 
   - 専門用語は必ず中学生でも理解できる言葉に言い換えて説明してください
   - 難しい概念は、身近な例え話や具体例を使って説明してください
   - 「つまり」「例えば」「たとえば」などの接続詞を使って、段階的に理解できるようにしてください

2. **例を交えた説明（簡潔に）**: 
   - 参考テキストの内容をそのまま抜粋するのではなく、必ず具体例や身近な例を交えて説明してください
   - 抽象的な説明の後には、必ず「例えば」で始まる具体例を1つだけ含めてください（複数の例は不要）
   - 例は、中学生が日常的に経験するような身近なものを使ってください
   - 例は簡潔に、1〜2文程度に留めてください

3. **かみ砕いた説明**: 
   - 参考テキストの内容をそのまま引用するのではなく、自分の言葉で分かりやすくかみ砕いて説明してください
   - 複雑な内容は、小さなステップに分けて順番に説明してください
   - 「これは、簡単に言うと...」のような表現を使って、要点を明確にしてください

4. **抜粋の要約**: 
   - 参考テキストから抜粋が必要な場合は、必ず要約してから使用してください
   - 長い文章は短くまとめ、要点だけを抽出してください
   - 抜粋は最小限に留め、自分の言葉での説明を優先してください

5. **マークダウン形式での回答**: すべての回答はマークダウン形式で提供してください
   - 見出しには **太字** を使用
   - 重要なポイントは **太字** で強調
   - リストは適切なインデントと記号を使用
   - 構造化された情報は表やセクションに整理

6. **柔軟な理解**: 質問の意図を理解し、テキスト内の同義語・類似表現・表記の違いを適切に認識してください
   - 例：「MacOS」と「macOS」、「Windows」と「Windows OS」など
   - 大文字小文字の違い、ハイフンの有無、略語なども考慮してください

7. **回答の範囲**: 提供されたテキスト内容をベースに回答してください
8. **推論の活用**: テキストに明記されていない内容についても、関連する知識を活用して推論し、有益な回答を提供してください
9. **簡潔さ**: 回答は端的に、要点を簡潔に伝えてください。冗長な表現や繰り返しは避けてください
10. **明確性**: 分かりやすく、構造化された回答を心がけてください
11. **丁寧さ**: 常に丁寧で親切な口調で回答してください（ただし、簡潔さを優先してください）
12. **教育的配慮**: 学習者の理解を促進するよう、分かりやすい説明を心がけてください

**重要な注意事項**:
- 参考テキストの抜粋のみを返すのではなく、必ず中学生レベルの語彙でかみ砕き、具体例を交えて説明してください
- 抜粋が必要な場合は、必ず要約してから使用してください（長い文章は短くまとめ、要点だけを抽出）
- 専門用語を使う場合は、必ずその後に「これは、簡単に言うと...」のような説明を追加してください（ただし簡潔に）
- 各説明には、必ず1つの具体例を含めてください（複数の例は不要）
- **回答は簡潔に、要点を端的に伝えてください。長い説明や繰り返しは避けてください**

テキストに含まれていない質問については、「この内容については担当指導員にお問い合わせください。」と回答してください。

13. **対話形式での対応**: 
   - 過去の会話履歴を考慮して、文脈に応じた柔軟な回答をしてください
   - ユーザーが前の回答について追加質問をしている場合は、前の回答を参照して説明してください
   - 「先ほどの説明について...」のような質問には、前の会話内容を踏まえて回答してください
   - 会話の流れを理解し、自然な対話を心がけてください`;
  }

  // 会話履歴をOpenAI API形式に変換
  formatConversationHistory(conversationHistory) {
    if (!conversationHistory || conversationHistory.length === 0) {
      return [];
    }

    // 最新10往復（20メッセージ）までに制限
    const maxHistoryLength = 20;
    const recentHistory = conversationHistory.slice(-maxHistoryLength);

    // メッセージ形式に変換
    // ユーザーの質問はそのまま、AIの回答は要約版を使用
    return recentHistory
      .filter(msg => msg.sender === 'user' || msg.sender === 'ai')
      .map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        // AIの回答の場合は要約を使用（要約がない場合は全文を使用）
        content: msg.sender === 'ai' ? (msg.summary || msg.text) : msg.text
      }));
  }

  // プロンプトを構築
  buildPrompt(question, contextText, lessonTitle) {
    return `レッスン: ${lessonTitle}

テキスト内容:
${contextText}

質問: ${question}

上記のテキスト内容に基づいて、質問に回答してください。

**重要な指示:**
- **中学生レベルの語彙で説明**: 専門用語は必ず中学生でも理解できる言葉に言い換えて説明してください。難しい概念は、身近な例え話や具体例を使って説明してください。
- **例を交えた説明（簡潔に）**: 参考テキストの内容をそのまま抜粋するのではなく、必ず具体例や身近な例を交えて説明してください。抽象的な説明の後には、必ず「例えば」で始まる具体例を1つだけ含めてください（1〜2文程度に留める）。
- **かみ砕いた説明**: 参考テキストの内容をそのまま引用するのではなく、自分の言葉で分かりやすくかみ砕いて説明してください。複雑な内容は、小さなステップに分けて順番に説明してください。
- **抜粋の要約**: 参考テキストから抜粋が必要な場合は、必ず要約してから使用してください。長い文章は短くまとめ、要点だけを抽出してください。
- **回答は必ずマークダウン形式で提供してください**
- 見出し、太字、リスト、インデントを適切に使用して構造化してください
- 質問の意図を理解し、同義語・類似表現・表記の違いを適切に認識してください
- 大文字小文字の違い、ハイフンの有無、略語なども考慮してください
- テキストに含まれていない内容については推論せず、明確に「この内容については担当指導員にご相談ください。」と回答してください
- 常に丁寧で親切な口調で回答してください
- 学習者の理解を促進するよう、分かりやすい説明を心がけてください
- **回答は簡潔で実用的な内容に留めてください。回答が出ているのにさらに「これ以上の内容は担当指導員にご相談ください。」といった文言は不要です**

**マークダウン形式の例:**
- 見出し: **見出しテキスト**
- 重要ポイント: **重要な情報**
- リスト: • 項目1
         • 項目2
- 構造化: セクションごとに適切に整理

例：
- 「MacOS」→「macOS」として認識
- 「Windows OS」→「Windows」として認識
- 「AI」→「人工知能」「artificial intelligence」として認識`;
  }

  // フォールバック回答を生成
  getFallbackAnswer(question) {
    return `申し訳ございません。現在、AIアシスタントの応答を取得できませんでした。

質問: "${question}"

以下の対処法をお試しください：
1. ページを再読み込みする
2. しばらく時間をおいて再度質問する
3. 質問を簡潔にし直す

技術的な問題が続く場合は、管理者にお問い合わせください。`;
  }

  // コンテキストの品質チェック
  validateContext(contextText) {
    if (!contextText || contextText.trim().length === 0) {
      return {
        isValid: false,
        error: 'テキスト内容が利用できません'
      };
    }

    if (contextText.length < 50) {
      return {
        isValid: false,
        error: 'テキスト内容が短すぎます'
      };
    }

    return { isValid: true };
  }

  // 質問の品質チェック
  validateQuestion(question) {
    if (!question || question.trim().length === 0) {
      return {
        isValid: false,
        error: '質問を入力してください'
      };
    }

    if (question.length < 3) {
      return {
        isValid: false,
        error: '質問が短すぎます'
      };
    }

    if (question.length > 500) {
      return {
        isValid: false,
        error: '質問が長すぎます（500文字以内で入力してください）'
      };
    }

    return { isValid: true };
  }
}

export default new AIAssistantService();

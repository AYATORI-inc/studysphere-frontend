// AIアシスタントサービス - GPT-4oモデルを使用
class AIAssistantService {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 
      (window.location.hostname === 'studysphere.ayatori-inc.co.jp' 
        ? 'https://backend.studysphere.ayatori-inc.co.jp' 
        : 'http://localhost:5050');
    this.apiKey = process.env.REACT_APP_OPENAI_API_KEY;
  }

  // GPT-4oモデルを使用して質問に回答
  async askQuestion(question, contextText, lessonTitle) {
    try {
      // コンテキストを適切な長さに制限（GPT-4oの制限を考慮）
      const maxContextLength = 40000;
      const truncatedContext = contextText.length > maxContextLength 
        ? contextText.substring(0, maxContextLength) + '...'
        : contextText;

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
          maxTokens: 1000,
          temperature: 0.6, // 適度な温度で柔軟性と正確性のバランスを取る
          systemPrompt: this.getSystemPrompt()
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
    return `あなたは学習支援AIアシスタントです。以下の指示に従ってください：

1. **マークダウン形式での回答**: すべての回答はマークダウン形式で提供してください
   - 見出しには **太字** を使用
   - 重要なポイントは **太字** で強調
   - リストは適切なインデントと記号を使用
   - 構造化された情報は表やセクションに整理

2. **柔軟な理解**: 質問の意図を理解し、テキスト内の同義語・類似表現・表記の違いを適切に認識してください
   - 例：「MacOS」と「macOS」、「Windows」と「Windows OS」など
   - 大文字小文字の違い、ハイフンの有無、略語なども考慮してください

3. **回答の範囲**: 提供されたテキスト内容の範囲内で回答してください
4. **推論の制限**: テキストに明記されていない内容について推論や憶測を行わないでください。
5. **明確性**: 分かりやすく、構造化された回答を心がけてください
6. **引用**: 可能であれば、テキストの該当部分を引用して回答してください
7. **丁寧さ**: 常に丁寧で親切な口調で回答してください
8. **教育的配慮**: 学習者の理解を促進するよう、分かりやすい説明を心がけてください

テキストに含まれていない質問については、「この内容については担当指導員にお問い合わせください。」と回答してください。`;
  }

  // プロンプトを構築
  buildPrompt(question, contextText, lessonTitle) {
    return `レッスン: ${lessonTitle}

テキスト内容:
${contextText}

質問: ${question}

上記のテキスト内容に基づいて、質問に回答してください。

**重要な指示:**
- **回答は必ずマークダウン形式で提供してください**
- 見出し、太字、リスト、インデントを適切に使用して構造化してください
- 質問の意図を理解し、同義語・類似表現・表記の違いを適切に認識してください
- 大文字小文字の違い、ハイフンの有無、略語なども考慮してください
- テキストに含まれていない内容については推論せず、明確に「この内容については担当指導員にご相談ください。」と回答してください
- 常に丁寧で親切な口調で回答してください
- 学習者の理解を促進するよう、分かりやすい説明を心がけてください
- 可能であれば、テキストの該当部分を引用して回答してください
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

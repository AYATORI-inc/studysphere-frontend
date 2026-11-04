import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const HomePage = () => {
  const [backgroundImage, setBackgroundImage] = useState('');
  const [characterImage, setCharacterImage] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ランダム背景画像の設定
  useEffect(() => {
    const randomNumber = Math.floor(Math.random() * 7) + 1;
    setBackgroundImage(`/images/background/${randomNumber}.png`);
  }, []);

  // ランダムキャラクター画像の設定
  useEffect(() => {
    const randomNumber = Math.floor(Math.random() * 6) + 1;
    setCharacterImage(`/images/mio/${randomNumber}.png`);
  }, []);

  return (
    <div className="min-h-screen bg-black">
      {/* ヘッダー */}
      <header className="fixed top-0 left-0 w-full bg-black bg-opacity-90 backdrop-blur-lg z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <a 
                href="https://www.ayatori-inc.co.jp/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-white text-3xl font-bold hover:text-blue-400 transition-colors"
              >
                AYATORI.Inc
              </a>
            </div>
            <nav className="hidden md:flex items-center space-x-8">
              <a href="https://ayatori-inc.co.jp/LP-AISchool/" className="text-white hover:text-blue-400 transition-colors font-medium relative group">
                主要機能
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-400 transition-all duration-300 group-hover:w-full"></span>
              </a>
              <a href="https://www.ayatori-inc.co.jp/StudySphere-Support/" className="text-white hover:text-blue-400 transition-colors font-medium relative group">
                サポート
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-400 transition-all duration-300 group-hover:w-full"></span>
              </a>
              <a href="https://ayatori-inc.co.jp/LP-remote-support/" className="text-white hover:text-blue-400 transition-colors font-medium relative group">
                在宅支援
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-400 transition-all duration-300 group-hover:w-full"></span>
              </a>
              <a href="https://studysphere.ayatori-inc.co.jp/support-app/" className="text-white hover:text-blue-400 transition-colors font-medium relative group">
                在宅アプリ
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-400 transition-all duration-300 group-hover:w-full"></span>
              </a>
              <a 
                href="https://www.ayatori-inc.co.jp/?page_id=7" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-white hover:text-blue-400 transition-colors font-medium relative group"
              >
                問い合わせ
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-400 transition-all duration-300 group-hover:w-full"></span>
              </a>
            </nav>
            {/* モバイルメニューボタン */}
            <div className="md:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((o) => !o)}
                className="text-white p-2 -mr-2 rounded-lg hover:bg-white/10 transition-colors"
                aria-label={mobileMenuOpen ? 'メニューを閉じる' : 'メニューを開く'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
        {/* モバイルメニュー */}
        <div
          className={`md:hidden absolute top-full left-0 right-0 bg-black/95 backdrop-blur-lg border-t border-white/10 overflow-hidden transition-all duration-300 ${
            mobileMenuOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
          }`}
          aria-hidden={!mobileMenuOpen}
        >
          <nav className="flex flex-col py-4 px-4 space-y-1">
            <a href="https://ayatori-inc.co.jp/LP-AISchool/" className="text-white py-3 px-4 rounded-lg hover:bg-white/10 transition-colors font-medium" onClick={() => setMobileMenuOpen(false)}>
              主要機能
            </a>
            <a href="https://www.ayatori-inc.co.jp/StudySphere-Support/" className="text-white py-3 px-4 rounded-lg hover:bg-white/10 transition-colors font-medium" onClick={() => setMobileMenuOpen(false)}>
              サポート
            </a>
            <a href="https://ayatori-inc.co.jp/LP-remote-support/" className="text-white py-3 px-4 rounded-lg hover:bg-white/10 transition-colors font-medium" onClick={() => setMobileMenuOpen(false)}>
              在宅支援
            </a>
            <a href="https://studysphere.ayatori-inc.co.jp/support-app/" className="text-white py-3 px-4 rounded-lg hover:bg-white/10 transition-colors font-medium" onClick={() => setMobileMenuOpen(false)}>
              在宅アプリ
            </a>
            <a href="https://www.ayatori-inc.co.jp/?page_id=7" target="_blank" rel="noopener noreferrer" className="text-white py-3 px-4 rounded-lg hover:bg-white/10 transition-colors font-medium" onClick={() => setMobileMenuOpen(false)}>
              問い合わせ
            </a>
          </nav>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main>
        {/* ヒーローセクション */}
        <section className="relative h-screen flex items-center justify-center text-center overflow-hidden bg-black pt-20">
          {/* 背景画像 */}
          <div 
            className="absolute top-0 left-0 w-full h-full bg-cover bg-center bg-no-repeat z-10"
            style={{
              backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
            }}
          >
            {/* オーバーレイ */}
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-black/20 via-black/40 to-black/80 z-20"></div>
          </div>
          
          {/* コンテンツ */}
          <div className="relative z-30 text-white max-w-4xl px-4 mx-auto">
            <h1 className="text-6xl md:text-7xl font-bold mb-6 text-shadow-lg animate-fade-in-up">
              StudySphere
            </h1>
            <p className="text-2xl md:text-3xl mb-8 opacity-90 animate-fade-in-up animation-delay-200">
              「学ぶ」は、あなたの力になる。
            </p>
            <p className="text-lg md:text-xl mb-12 opacity-80 leading-relaxed animate-fade-in-up animation-delay-400">
              ここから、あなたのペースで未来を創ろう。
            </p>
            
            {/* ボタン群 */}
            <div className="flex flex-col sm:flex-row justify-center items-center gap-6 animate-fade-in-up animation-delay-600">
              <Link
                to="/admin-instructor-login"
                className="bg-white/20 text-white px-8 py-4 rounded-full hover:bg-white/30 transition-all duration-300 font-semibold text-lg border-2 border-white/30 hover:border-white/50 transform hover:-translate-y-1 hover:shadow-xl backdrop-blur-sm"
              >
                管理者・指導員
              </Link>
              <Link
                to="/student-login"
                className="bg-white/20 text-white px-8 py-4 rounded-full hover:bg-white/30 transition-all duration-300 font-semibold text-lg border-2 border-white/30 hover:border-white/50 transform hover:-translate-y-1 hover:shadow-xl backdrop-blur-sm"
              >
                利用者
              </Link>
              <a
                href="https://studysphere.ayatori-inc.co.jp/support-app"
                className="bg-white/20 text-white px-8 py-4 rounded-full hover:bg-white/30 transition-all duration-300 font-semibold text-lg border-2 border-white/30 hover:border-white/50 transform hover:-translate-y-1 hover:shadow-xl backdrop-blur-sm flex items-center gap-3"
              >
              <span className="animate-bounce">⬇</span>
                在宅アプリダウンロードページへ
              </a>
            </div>
          </div>
        </section>

        {/* 学習機能セクション */}
        <section className="py-20 bg-black">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-4xl mx-auto">
              <div className="flex flex-col items-center gap-8">
                {/* テキスト部分 */}
                <div className="max-w-2xl">
                  <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                    学習の質を高める、StudySphereのすべて。
                  </h2>
                  <p className="text-xl text-gray-300 leading-relaxed">
                    あなたの「学びたい」を叶える機能、安心のサポート、<br />
                    自由な学習環境をご紹介します。
                  </p>
                </div>
                
                {/* キャラクター画像 */}
                <div className="order-2 md:order-1">
                  {characterImage && (
                    <img 
                      src={characterImage} 
                      alt="キャラクター" 
                      className="max-w-48 md:max-w-64 h-auto rounded-xl shadow-2xl hover:scale-105 transition-transform duration-300"
                    />
                  )}
                </div>
                
                {/* ボタン群 */}
                <div className="flex flex-wrap justify-center gap-4 order-3">
                  <a 
                    href="https://ayatori-inc.co.jp/LP-AISchool/" 
                    className="bg-transparent border-2 border-white text-white px-6 py-3 rounded hover:bg-white hover:text-black transition-all duration-300 font-semibold"
                  >
                    主要機能
                  </a>
                  <a 
                    href="https://www.ayatori-inc.co.jp/StudySphere-Support/" 
                    className="bg-transparent border-2 border-white text-white px-6 py-3 rounded hover:bg-white hover:text-black transition-all duration-300 font-semibold"
                  >
                    サポート
                  </a>
                  <a 
                    href="https://ayatori-inc.co.jp/LP-remote-support/" 
                    className="bg-transparent border-2 border-white text-white px-6 py-3 rounded hover:bg-white hover:text-black transition-all duration-300 font-semibold"
                  >
                    在宅支援
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* フッター */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="border-t border-gray-800 pt-6">
              <p className="text-gray-500 text-sm">
                Copyright© AYATORI.inc All Rights Reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;

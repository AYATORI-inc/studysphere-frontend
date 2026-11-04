import React, { useState, useEffect } from 'react';
import { formatUTCToJapanTimeString } from '../../utils/dateUtils';
import { API_BASE_URL } from '../../config/apiConfig';

const UserDetailModal = ({ isOpen, onClose, selectedUser }) => {
  const [captureRecords, setCaptureRecords] = useState({ photos: [], screenshots: [] });
  const [loading, setLoading] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(-1);

  // S3から画像データを取得
  const fetchCaptureRecords = async () => {
    if (!selectedUser || !selectedUser.id) return;
    
    setLoading(true);
    try {
      // selectedUser.dateがあればそれを使用、なければ今日の日付を使用
      const targetDate = selectedUser.date || new Date().toISOString().split('T')[0];
      console.log('UserDetailModal: 対象日付:', targetDate, 'selectedUser.date:', selectedUser.date);
      
      // バックエンドのAPIを呼び出してS3の画像データを取得
      const response = await fetch(`${API_BASE_URL}/api/remote-support/capture-records/${selectedUser.id}/${targetDate}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCaptureRecords({
            photos: data.data.photos || [],
            screenshots: data.data.screenshots || []
          });
          setStartTime(data.data.startTime || null);
        }
      } else {
        console.error('画像データの取得に失敗しました:', response.status);
      }
    } catch (error) {
      console.error('画像データの取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && selectedUser) {
      fetchCaptureRecords();
    }
  }, [isOpen, selectedUser]);

  // すべての画像を時刻順にソートしてグループ化
  const getAllImagesSorted = () => {
    const allImages = [
      ...captureRecords.photos.map(img => ({ ...img, type: 'camera' })),
      ...captureRecords.screenshots.map(img => ({ ...img, type: 'screenshot' }))
    ].sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    
    return allImages;
  };

  // 画像をクリックしたときのハンドラー
  const handleImageClick = (image, index) => {
    setSelectedImage(image);
    setSelectedImageIndex(index);
  };

  // 拡大表示モーダルを閉じる
  const handleCloseImageModal = () => {
    setSelectedImage(null);
    setSelectedImageIndex(-1);
  };

  // 前の画像に移動
  const handlePreviousImage = () => {
    const allImages = getAllImagesSorted();
    if (selectedImageIndex > 0) {
      const newIndex = selectedImageIndex - 1;
      setSelectedImage(allImages[newIndex]);
      setSelectedImageIndex(newIndex);
    }
  };

  // 次の画像に移動
  const handleNextImage = () => {
    const allImages = getAllImagesSorted();
    if (selectedImageIndex < allImages.length - 1) {
      const newIndex = selectedImageIndex + 1;
      setSelectedImage(allImages[newIndex]);
      setSelectedImageIndex(newIndex);
    }
  };

  // キーボードイベントハンドラー
  useEffect(() => {
    if (!selectedImage) return;

    const allImages = getAllImagesSorted();
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedImage(null);
        setSelectedImageIndex(-1);
      } else if (e.key === 'ArrowLeft' && selectedImageIndex > 0) {
        const newIndex = selectedImageIndex - 1;
        setSelectedImage(allImages[newIndex]);
        setSelectedImageIndex(newIndex);
      } else if (e.key === 'ArrowRight' && selectedImageIndex < allImages.length - 1) {
        const newIndex = selectedImageIndex + 1;
        setSelectedImage(allImages[newIndex]);
        setSelectedImageIndex(newIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, selectedImageIndex, captureRecords]);

  if (!isOpen || !selectedUser) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">{selectedUser.name} 詳細</h2>
            <button 
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* サマリーカード */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
              <div className="flex items-center gap-3">
                <span className="text-blue-600 text-2xl">🕐</span>
                <div>
                  <p className="text-blue-600 text-sm font-medium">開始時間</p>
                  <p className="text-lg font-bold text-blue-800">
                    {startTime 
                      ? new Date(startTime).toLocaleTimeString('ja-JP', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          timeZone: 'Asia/Tokyo'
                        })
                      : '-'}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-green-50 p-4 rounded-xl border border-green-200">
              <div className="flex items-center gap-3">
                <span className="text-green-600 text-2xl">📊</span>
                <div>
                  <p className="text-green-600 text-sm font-medium">記録数</p>
                  <p className="text-lg font-bold text-green-800">{captureRecords.photos.length + captureRecords.screenshots.length}件</p>
                </div>
              </div>
            </div>
            <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
              <div className="flex items-center gap-3">
                <span className="text-purple-600 text-2xl">🖥️</span>
                <div>
                  <p className="text-purple-600 text-sm font-medium">デスクトップ</p>
                  <p className="text-lg font-bold text-purple-800">{captureRecords.screenshots.length}件</p>
                </div>
              </div>
            </div>
            <div className="bg-orange-50 p-4 rounded-xl border border-orange-200">
              <div className="flex items-center gap-3">
                <span className="text-orange-600 text-2xl">📷</span>
                <div>
                  <p className="text-orange-600 text-sm font-medium">カメラ</p>
                  <p className="text-lg font-bold text-orange-800">{captureRecords.photos.length}件</p>
                </div>
              </div>
            </div>
          </div>

          {/* 今日の記録一覧 */}
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">📸 今日の記録</h4>
            
            {loading ? (
              <div className="text-center py-12">
                <div className="text-blue-600 text-xl font-semibold mb-2">読み込み中...</div>
                <div className="text-gray-500">画像データを取得しています</div>
              </div>
            ) : captureRecords.photos.length === 0 && captureRecords.screenshots.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-500 text-lg">本日の記録はありません</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {getAllImagesSorted().map((image, index) => {
                  // S3のLastModifiedはUTCで返ってくるので、JSTに変換
                  const date = new Date(image.lastModified);
                  
                  // 時刻のみ表示（HH:MM形式）
                  const timeString = date.toLocaleTimeString('ja-JP', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    timeZone: 'Asia/Tokyo'
                  });
                  
                  // 日時表示（YYYY/MM/DD HH:MM形式）
                  const dateTimeString = date.toLocaleString('ja-JP', { 
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Tokyo'
                  });
                  
                  // デバッグ: 画像URLをログ出力
                  console.log('画像データ:', {
                    url: image.url,
                    lastModified: image.lastModified,
                    type: image.type,
                    parsedDate: date.toString()
                  });
                  
                  return (
                    <div key={index} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-lg transition-shadow">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={image.type === 'camera' ? 'text-orange-600' : 'text-blue-600'}>
                            {image.type === 'camera' ? '📷' : '🖥️'}
                          </span>
                          <span className="text-sm font-medium text-gray-800">
                            {image.type === 'camera' ? 'カメラ' : 'デスクトップ'}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">{timeString}</span>
                      </div>
                      <div 
                        className="rounded-lg h-24 flex items-center justify-center mb-2 overflow-hidden bg-gray-100 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => handleImageClick(image, index)}
                      >
                        <img 
                          src={image.url} 
                          alt={image.type === 'camera' ? 'カメラ画像' : 'スクリーンショット'}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            console.error('画像読み込みエラー:', image.url);
                            e.target.style.display = 'none';
                            e.target.parentElement.innerHTML = '<span class="text-xs text-gray-500">画像読み込みエラー</span>';
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-600">{dateTimeString}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 操作ボタン */}
          <div className="flex justify-end">
            <button 
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>

      {/* 画像拡大表示モーダル */}
      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[60]"
          onClick={handleCloseImageModal}
        >
          {/* 閉じるボタン - 画面全体に対して固定位置 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCloseImageModal();
            }}
            className="fixed top-4 right-4 text-white hover:text-red-300 hover:bg-red-600 text-5xl font-bold z-20 bg-red-500 bg-opacity-90 rounded-full w-16 h-16 flex items-center justify-center shadow-2xl border-2 border-white hover:scale-110 transition-all duration-200 leading-none"
            title="閉じる (ESC)"
            style={{ lineHeight: '1' }}
          >
            ×
          </button>

          {/* 前の画像ボタン - 画面全体に対して固定位置 */}
          {selectedImageIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePreviousImage();
              }}
              className="fixed left-4 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-300 text-4xl font-bold z-10 bg-black bg-opacity-50 rounded-full w-12 h-12 flex items-center justify-center hover:bg-opacity-70 transition-all"
            >
              ‹
            </button>
          )}

          {/* 次の画像ボタン - 画面全体に対して固定位置 */}
          {selectedImageIndex < getAllImagesSorted().length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNextImage();
              }}
              className="fixed right-4 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-300 text-4xl font-bold z-10 bg-black bg-opacity-50 rounded-full w-12 h-12 flex items-center justify-center hover:bg-opacity-70 transition-all"
            >
              ›
            </button>
          )}

          <div 
            className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >

            {/* 画像情報 */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white bg-black bg-opacity-50 rounded-lg px-4 py-2 z-10">
              <div className="flex items-center gap-2 mb-1">
                <span className={selectedImage.type === 'camera' ? 'text-orange-400' : 'text-blue-400'}>
                  {selectedImage.type === 'camera' ? '📷' : '🖥️'}
                </span>
                <span className="font-medium">
                  {selectedImage.type === 'camera' ? 'カメラ' : 'デスクトップ'}
                </span>
                <span className="text-gray-300">
                  {new Date(selectedImage.lastModified).toLocaleString('ja-JP', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Tokyo'
                  })}
                </span>
              </div>
              <div className="text-sm text-gray-300 text-center">
                {selectedImageIndex + 1} / {getAllImagesSorted().length}
              </div>
            </div>

            {/* 拡大画像 */}
            <img
              src={selectedImage.url}
              alt={selectedImage.type === 'camera' ? 'カメラ画像' : 'スクリーンショット'}
              className="max-w-full max-h-[90vh] object-contain"
              onError={(e) => {
                console.error('画像読み込みエラー:', selectedImage.url);
                e.target.style.display = 'none';
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default UserDetailModal;
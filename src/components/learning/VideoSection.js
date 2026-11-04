import React, { useEffect, useRef, useState } from 'react';
import LessonVideoPlayer from '../LessonVideoPlayer';

const useAspectFit = (aspectRatio = 16 / 9) => {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      // 最小サイズをチェック（10px以上）
      if (rect.width < 10 || rect.height < 10) {
        return;
      }

      // 利用可能なサイズを計算（少し余裕を持たせる）
      const availableWidth = rect.width;
      const availableHeight = rect.height;

      // アスペクト比を維持しながら、利用可能な領域に収まるサイズを計算
      // まず幅基準で計算
      let fittedWidth = availableWidth;
      let fittedHeight = fittedWidth / aspectRatio;

      // 高さが利用可能な領域を超える場合は、高さを基準に再計算
      if (fittedHeight > availableHeight) {
        fittedHeight = availableHeight;
        fittedWidth = fittedHeight * aspectRatio;
        
        // 幅が利用可能な領域を超える場合は、幅を制限して再計算
        if (fittedWidth > availableWidth) {
          fittedWidth = availableWidth;
          fittedHeight = fittedWidth / aspectRatio;
        }
      }

      // 安全マージンを追加（2pxの余裕を持たせる）
      const safetyMargin = 2;
      const finalWidth = Math.max(1, Math.floor(fittedWidth - safetyMargin));
      const finalHeight = Math.max(1, Math.floor(fittedHeight - safetyMargin));

      // 最終的なサイズがコンテナを超えないことを確認
      const maxWidth = Math.floor(availableWidth);
      const maxHeight = Math.floor(availableHeight);
      
      const clampedWidth = Math.min(finalWidth, maxWidth);
      const clampedHeight = Math.min(finalHeight, maxHeight);

      // サイズが変更された場合のみ更新
      setDimensions(prev => {
        if (prev.width !== clampedWidth || prev.height !== clampedHeight) {
          return {
            width: clampedWidth,
            height: clampedHeight
          };
        }
        return prev;
      });
    };

    // 初期サイズを設定（複数回試行して確実に取得）
    const timeoutId1 = setTimeout(updateSize, 0);
    const timeoutId2 = setTimeout(updateSize, 50);
    const timeoutId3 = setTimeout(updateSize, 100);

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        // ResizeObserverのコールバックを少し遅延させて、レイアウトが確定するのを待つ
        requestAnimationFrame(() => {
          requestAnimationFrame(updateSize);
        });
      });
      resizeObserver.observe(container);
    }

    window.addEventListener('resize', updateSize);

    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', updateSize);
    };
  }, [aspectRatio]);

  return { containerRef, dimensions };
};

const FittedVideoPlayer = ({ videoUrl, title }) => {
  const { containerRef, dimensions } = useAspectFit(16 / 9);
  const hasSize = dimensions.width > 0 && dimensions.height > 0;

  return (
    <div 
      ref={containerRef} 
      className="flex-1 w-full flex items-center justify-center min-w-0 min-h-0"
      style={{ 
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {hasSize ? (
        <div
          style={{
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            maxWidth: '100%',
            maxHeight: '100%',
            aspectRatio: '16 / 9',
            flexShrink: 0
          }}
          className="rounded-lg overflow-hidden bg-black shadow-inner"
        >
          <LessonVideoPlayer
            videoUrl={videoUrl}
            title={title}
            containerClassName="w-full h-full bg-black"
          />
        </div>
      ) : (
        <div 
          className="w-full"
          style={{
            aspectRatio: '16 / 9',
            maxWidth: '100%',
            maxHeight: '100%'
          }}
        >
          <LessonVideoPlayer videoUrl={videoUrl} title={title} />
        </div>
      )}
    </div>
  );
};

const VideoSection = ({ lessonData }) => {
  const videos = lessonData?.videos || [];
  const hasVideos = videos.length > 0;
  const isSingleVideo = videos.length === 1;
  
  // デバッグログ
  console.log('🎥 VideoSection レンダリング:', {
    hasLessonData: !!lessonData,
    videos: videos,
    videoCount: videos.length,
    hasVideos: hasVideos,
    lessonDataId: lessonData?.id
  });

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-3 mb-4 flex-none workspace-widget-handle cursor-move select-none">
        <span className="text-2xl">🎥</span>
        <h3 className="text-xl font-bold text-gray-800">動画学習</h3>
      </div>
      
      {hasVideos ? (
        <div
          className={`flex-1 min-h-0 flex flex-col ${
            isSingleVideo ? '' : 'space-y-6 overflow-y-auto custom-scrollbar pr-1'
          }`}
        >
          {videos.map((video, index) => {
            const videoWrapperClass = isSingleVideo
              ? 'flex-1 flex flex-col overflow-hidden'
              : 'flex flex-col';
            
            return (
              <div key={video.id || index} className={videoWrapperClass}>
                <div className="flex-none mb-4 p-4 bg-blue-50 rounded-lg">
                  <p className="font-semibold text-blue-800 mb-1">{video.title}</p>
                  <p className="text-sm text-blue-600">{video.description}</p>
                </div>
                <div className={isSingleVideo ? 'flex-1 flex min-h-0 min-w-0' : 'flex min-h-0 min-w-0'}>
                  <FittedVideoPlayer videoUrl={video.youtube_url} title={video.title} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <p>このレッスンには動画がありません。</p>
        </div>
      )}
    </div>
  );
};

export default VideoSection;

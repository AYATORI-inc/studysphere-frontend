import React from 'react';
import { youtubeThumbnailUrl } from './lessonSections';

const fieldClass = 'w-full rounded-lg border border-sky-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-sky-400';

const text = (value) => (value ? value : 'なし');

const LessonSectionFacts = ({ section, thumbnailUrl, onDownload, downloading }) => {
  const image = thumbnailUrl !== undefined ? thumbnailUrl : section.thumbnailUrl;
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-lg font-bold leading-snug text-gray-900">{text(section.videoTitle)}</h3>
        <p className="rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-900">{text(section.videoDuration)}</p>
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-[240px_1fr]">
        <div>
          <p className="text-xs font-semibold text-gray-500">サムネイル</p>
          {image ? (
            <img src={image} alt="" className="mt-2 aspect-video w-full rounded-lg object-cover" />
          ) : (
            <p className="mt-2 flex aspect-video items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500">なし</p>
          )}
        </div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs font-semibold text-gray-500">動画の説明</dt>
            <dd className="mt-1 whitespace-pre-wrap text-gray-900">{text(section.videoDescription)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">URL</dt>
            <dd className="mt-1 break-all text-gray-900">
              {section.youtubeUrl ? (
                <a href={section.youtubeUrl} target="_blank" rel="noreferrer" className="text-sky-800 underline underline-offset-4">
                  {section.youtubeUrl}
                </a>
              ) : 'なし'}
            </dd>
          </div>
        </dl>
      </div>
      <div className="rounded-lg bg-sky-50 px-4 py-3">
        <p className="text-xs font-semibold text-sky-800">ファイル名称</p>
        {section.key && onDownload ? (
          <button
            type="button"
            onClick={() => onDownload(section)}
            disabled={downloading}
            className="mt-1 break-all text-left text-sm font-medium text-sky-800 underline underline-offset-4 disabled:opacity-50"
          >
            {downloading ? 'ダウンロード中...' : text(section.fileName)}
          </button>
        ) : (
          <p className="mt-1 break-all text-sm text-gray-900">{text(section.fileName)}</p>
        )}
      </div>
    </div>
  );
};

export const draftThumbnail = (url) => youtubeThumbnailUrl(url);

export const VideoDraftFields = ({ value, onChange }) => {
  const thumbnail = draftThumbnail(value.url);
  return (
    <div className="grid gap-4 sm:grid-cols-[168px_1fr]">
      <div>
        <p className="text-sm font-semibold text-gray-700">サムネイル</p>
        {thumbnail ? (
          <img src={thumbnail} alt="" className="mt-2 h-24 w-40 rounded-lg object-cover" />
        ) : (
          <p className="mt-2 text-sm text-gray-600">URLを入れると表示されます</p>
        )}
      </div>
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-2 block font-semibold text-gray-700">動画名称</span>
          <input className={fieldClass} value={value.title} onChange={(event) => onChange('title', event.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-2 block font-semibold text-gray-700">動画の説明</span>
          <textarea className={fieldClass} rows={2} value={value.description} onChange={(event) => onChange('description', event.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-2 block font-semibold text-gray-700">URL</span>
          <input className={fieldClass} value={value.url} onChange={(event) => onChange('url', event.target.value)} placeholder="空欄ならテキストだけのセクションです" />
        </label>
        <label className="block text-sm">
          <span className="mb-2 block font-semibold text-gray-700">時間</span>
          <input className={fieldClass} value={value.duration} onChange={(event) => onChange('duration', event.target.value)} placeholder="例：15分30秒" />
        </label>
      </div>
    </div>
  );
};

export default LessonSectionFacts;

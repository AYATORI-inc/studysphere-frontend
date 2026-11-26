export const fileBaseName = (key) => {
  if (!key) return '';
  const name = String(key).split('/').pop() || '';
  try {
    return decodeURIComponent(name);
  } catch (error) {
    return name;
  }
};

const baseKey = (key) => fileBaseName(key).trim().toLowerCase();

export const isYoutubeUrl = (value) => {
  const url = String(value || '').trim();
  return url.includes('youtube.com/watch?v=') || url.includes('youtu.be/');
};

export const youtubeThumbnailUrl = (url) => {
  if (!url) return '';
  const match = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : '';
};

const videoFields = (link, videosById) => {
  const video = link?.video_id != null ? videosById.get(String(link.video_id)) : null;
  const youtubeUrl = video?.youtube_url || link?.youtube_url || '';
  return {
    videoTitle: video?.title || link?.video_title || '',
    videoDescription: video?.description || '',
    youtubeUrl,
    videoDuration: video?.duration || '',
    thumbnailUrl: youtubeThumbnailUrl(youtubeUrl),
  };
};

export const buildSections = (lesson, textFiles, links, videos = []) => {
  const files = [];
  const seen = new Set();
  const addFile = (file) => {
    const nameKey = baseKey(file.key);
    if (!file.key || seen.has(nameKey)) return;
    seen.add(nameKey);
    files.push(file);
  };

  if (lesson?.s3_key) {
    addFile({
      key: lesson.s3_key,
      name: fileBaseName(lesson.s3_key),
      source: 'main',
      order: -1,
    });
  }

  textFiles.forEach((file) => {
    addFile({
      key: file.s3_key,
      name: file.file_name || fileBaseName(file.s3_key),
      source: 'text',
      textFileId: file.id,
      order: Number(file.order_index) || 0,
    });
  });

  const videosById = new Map();
  videos.forEach((video) => {
    if (video?.id != null) videosById.set(String(video.id), video);
  });

  const linkByName = new Map();
  links.forEach((link) => {
    const nameKey = baseKey(link.text_file_key);
    if (nameKey && !linkByName.has(nameKey)) linkByName.set(nameKey, link);
  });

  const sections = files.map((file) => {
    const link = linkByName.get(baseKey(file.key));
    return {
      key: file.key,
      fileName: file.name || fileBaseName(file.key),
      source: file.source,
      textFileId: file.textFileId || null,
      linkId: link?.id || null,
      videoId: link?.video_id || null,
      ...videoFields(link, videosById),
      order: link?.link_order != null && link.link_order !== '' ? Number(link.link_order) : file.order,
    };
  });

  links.forEach((link) => {
    const nameKey = baseKey(link.text_file_key);
    if (!nameKey || seen.has(nameKey)) return;
    seen.add(nameKey);
    sections.push({
      key: link.text_file_key,
      fileName: fileBaseName(link.text_file_key),
      source: 'link',
      textFileId: null,
      linkId: link.id,
      videoId: link.video_id || null,
      ...videoFields(link, videosById),
      order: link.link_order != null ? Number(link.link_order) : 999,
    });
  });

  sections.sort((left, right) => {
    const order = left.order - right.order;
    if (order !== 0) return order;
    return left.fileName.localeCompare(right.fileName, 'ja');
  });

  return sections;
};

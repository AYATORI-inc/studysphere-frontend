import React, { useMemo } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

export const DEFAULT_BREAKPOINTS = {
  lg: 1200,
  md: 996,
  sm: 768,
  xs: 576,
  xxs: 0
};

export const DEFAULT_COLS = {
  lg: 12,
  md: 10,
  sm: 6,
  xs: 4,
  xxs: 2
};

const BASE_LAYOUTS = {
  lg: [
    { i: 'video', x: 0, y: 0, w: 4, h: 12, minW: 2, minH: 6 },
    { i: 'text', x: 4, y: 0, w: 4, h: 12, minW: 2, minH: 6 },
    { i: 'chat', x: 8, y: 0, w: 4, h: 12, minW: 2, minH: 6 },
    { i: 'assignment', x: 8, y: 12, w: 4, h: 7, minW: 2, minH: 4 }
  ],
  md: [
    { i: 'video', x: 0, y: 0, w: 5, h: 12, minW: 2, minH: 6 },
    { i: 'text', x: 5, y: 0, w: 5, h: 12, minW: 2, minH: 6 },
    { i: 'chat', x: 0, y: 12, w: 5, h: 12, minW: 2, minH: 6 },
    { i: 'assignment', x: 5, y: 12, w: 5, h: 7, minW: 2, minH: 4 }
  ],
  sm: [
    { i: 'video', x: 0, y: 0, w: 6, h: 12, minW: 2, minH: 6 },
    { i: 'text', x: 0, y: 12, w: 6, h: 12, minW: 2, minH: 6 },
    { i: 'chat', x: 0, y: 24, w: 6, h: 12, minW: 2, minH: 6 },
    { i: 'assignment', x: 0, y: 36, w: 6, h: 7, minW: 2, minH: 4 }
  ],
  xs: [
    { i: 'video', x: 0, y: 0, w: 4, h: 12, minW: 2, minH: 6 },
    { i: 'text', x: 0, y: 12, w: 4, h: 12, minW: 2, minH: 6 },
    { i: 'chat', x: 0, y: 24, w: 4, h: 12, minW: 2, minH: 6 },
    { i: 'assignment', x: 0, y: 36, w: 4, h: 7, minW: 2, minH: 4 }
  ],
  xxs: [
    { i: 'video', x: 0, y: 0, w: 2, h: 12, minW: 1, minH: 6 },
    { i: 'text', x: 0, y: 12, w: 2, h: 12, minW: 1, minH: 6 },
    { i: 'chat', x: 0, y: 24, w: 2, h: 12, minW: 1, minH: 6 },
    { i: 'assignment', x: 0, y: 36, w: 2, h: 7, minW: 1, minH: 4 }
  ]
};

const WIDGET_KEYS = ['video', 'text', 'chat', 'assignment'];

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const ensureLayoutArray = (layouts, breakpoint) => {
  if (layouts && Array.isArray(layouts[breakpoint])) {
    return deepClone(layouts[breakpoint]);
  }
  return deepClone(BASE_LAYOUTS[breakpoint]);
};

const enforceWidgetPresence = (layoutItems, includeAssignment, breakpoint, widgetVisibility = null) => {
  const requiredKeys = includeAssignment ? WIDGET_KEYS : WIDGET_KEYS.filter(key => key !== 'assignment');
  const baseItems = BASE_LAYOUTS[breakpoint];

  // すべてのウィジェット（表示/非表示に関係なく）のレイアウト情報を保持
  const allWidgetKeys = includeAssignment ? WIDGET_KEYS : WIDGET_KEYS.filter(key => key !== 'assignment');
  
  // 既存のレイアウトアイテムを保持（表示/非表示に関係なく）
  const preservedItems = layoutItems
    .filter(item => allWidgetKeys.includes(item.i))
    .map(item => {
      const base = baseItems.find(baseItem => baseItem.i === item.i);
      return {
        ...item,
        minW: item.minW ?? base?.minW ?? 1,
        minH: item.minH ?? base?.minH ?? 1
      };
    });

  // 表示されているウィジェットのみを返す（レンダリング用）
  const filtered = preservedItems.filter(item => {
    if (widgetVisibility === null) {
      // widgetVisibilityが指定されていない場合は、requiredKeysに含まれるもののみ
      return requiredKeys.includes(item.i);
    }
    // widgetVisibilityが指定されている場合は、表示されているもののみ
    return requiredKeys.includes(item.i) && widgetVisibility[item.i] !== false;
  });

  // 必要なウィジェットが存在しない場合は、デフォルトを追加
  requiredKeys.forEach(key => {
    if (!preservedItems.some(item => item.i === key)) {
      const baseItem = baseItems.find(base => base.i === key);
      if (baseItem) {
        preservedItems.push({ ...baseItem });
        if (!filtered.some(item => item.i === key)) {
          filtered.push({ ...baseItem });
        }
      }
    } else if (!filtered.some(item => item.i === key)) {
      // レイアウト情報は存在するが、フィルタリングで除外された場合は追加
      const preservedItem = preservedItems.find(item => item.i === key);
      if (preservedItem && (widgetVisibility === null || widgetVisibility[key] !== false)) {
        filtered.push(preservedItem);
      }
    }
  });

  // 非表示のウィジェットのレイアウト情報も保持するために、preservedItemsを返す
  // ただし、実際にレンダリングされるのはfilteredのみ
  return { filtered, preserved: preservedItems };
};

export const normalizeLayouts = (layouts, includeAssignment, widgetVisibility = null) => {
  const normalized = {};

  Object.keys(BASE_LAYOUTS).forEach(breakpoint => {
    const layoutItems = ensureLayoutArray(layouts, breakpoint);
    const result = enforceWidgetPresence(layoutItems, includeAssignment, breakpoint, widgetVisibility);
    // 非表示のウィジェットのレイアウト情報も保持する
    normalized[breakpoint] = result.preserved;
  });

  return normalized;
};

// 表示されているウィジェットのみをフィルタリングする関数
export const filterVisibleLayouts = (layouts, widgetVisibility, includeAssignment) => {
  const filtered = {};
  const requiredKeys = includeAssignment ? WIDGET_KEYS : WIDGET_KEYS.filter(key => key !== 'assignment');

  Object.keys(layouts).forEach(breakpoint => {
    filtered[breakpoint] = layouts[breakpoint].filter(item => {
      return requiredKeys.includes(item.i) && widgetVisibility[item.i] !== false;
    });
  });

  return filtered;
};

export const createDefaultLayouts = (includeAssignment = false) =>
  normalizeLayouts(undefined, includeAssignment);

const COMMON_KEYS = ['video', 'text', 'chat'];

/** 2つのレイアウトで video / text / chat の位置を揃える（提出物の有無でレイアウトが変わらないようにする） */
export const syncCommonLayoutItems = (withLayout, withoutLayout) => {
  if (!withLayout || !withoutLayout) return { withLayout, withoutLayout };
  const result = {};
  Object.keys(withoutLayout).forEach(breakpoint => {
    const withArr = withLayout[breakpoint] || [];
    const withoutArr = withoutLayout[breakpoint] || [];
    result[breakpoint] = withoutArr.map(withoutItem => {
      if (!COMMON_KEYS.includes(withoutItem.i)) return withoutItem;
      const fromWith = withArr.find(w => w.i === withoutItem.i);
      if (!fromWith) return withoutItem;
      return { ...withoutItem, x: fromWith.x, y: fromWith.y, w: fromWith.w, h: fromWith.h };
    });
  });
  return { withLayout, withoutLayout: result };
};

/** 4項目レイアウトから assignment を除いた3項目レイアウトを返す（位置はそのまま） */
export const layoutWithoutAssignment = (fullLayout) => {
  if (!fullLayout) return fullLayout;
  const result = {};
  Object.keys(fullLayout).forEach(breakpoint => {
    result[breakpoint] = (fullLayout[breakpoint] || []).filter(item => item.i !== 'assignment');
  });
  return result;
};

const LearningWorkspaceLayout = ({
  widgets,
  layouts,
  hasAssignment,
  onLayoutsChange,
  widgetVisibility = null,
  rowHeight = 40,
  margin = [16, 16],
  containerPadding = [0, 0]
}) => {
  const activeWidgetKeys = useMemo(() => {
    const base = ['video', 'text', 'chat'];
    if (hasAssignment && widgets.assignment) {
      base.push('assignment');
    }
    return base.filter(key => !!widgets[key]);
  }, [hasAssignment, widgets]);

  // 表示されているウィジェットのみのレイアウトを取得
  const visibleLayouts = useMemo(() => {
    if (widgetVisibility === null) {
      return layouts;
    }
    return filterVisibleLayouts(layouts, widgetVisibility, hasAssignment);
  }, [layouts, widgetVisibility, hasAssignment]);

  return (
    <div className="learning-workspace-layout">
      <ResponsiveGridLayout
        className="workspace-grid"
        layouts={visibleLayouts}
        breakpoints={DEFAULT_BREAKPOINTS}
        cols={DEFAULT_COLS}
        rowHeight={rowHeight}
        margin={margin}
        containerPadding={containerPadding}
        compactType="vertical"
        draggableHandle=".workspace-widget-handle"
        preventCollision={false}
        allowOverlap={false}
        useCSSTransforms={true}
        resizeHandles={['s', 'w', 'e', 'n', 'sw', 'se', 'nw', 'ne']}
        onLayoutChange={(_, allLayouts) => {
          if (onLayoutsChange) {
            // 非表示のウィジェットのレイアウト情報も含めて保存
            const allLayoutsWithHidden = {};
            Object.keys(layouts).forEach(breakpoint => {
              // 既存のレイアウト（非表示のウィジェットも含む）をコピー
              allLayoutsWithHidden[breakpoint] = [...(layouts[breakpoint] || [])];
            });
            
            // 表示されているウィジェットのレイアウトを更新
            Object.keys(allLayouts).forEach(breakpoint => {
              allLayouts[breakpoint].forEach(visibleItem => {
                const breakpointLayouts = allLayoutsWithHidden[breakpoint] || [];
                const existingIndex = breakpointLayouts.findIndex(item => item.i === visibleItem.i);
                if (existingIndex >= 0) {
                  // 既存のレイアウト情報を更新
                  breakpointLayouts[existingIndex] = visibleItem;
                } else {
                  // 新しいレイアウト情報を追加
                  breakpointLayouts.push(visibleItem);
                }
                allLayoutsWithHidden[breakpoint] = breakpointLayouts;
              });
            });
            onLayoutsChange(allLayoutsWithHidden);
          }
        }}
      >
        {activeWidgetKeys.map(key => (
          <div key={key} className="workspace-grid-item h-full min-h-0 flex flex-col">
            {widgets[key]}
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
};

export default LearningWorkspaceLayout;


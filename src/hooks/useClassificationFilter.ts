import { useState, useCallback, useMemo } from 'react';
import type { CanvasObject } from '../types';

// Predefined classification colors for consistent visual identification
const CLASSIFICATION_COLORS: Record<string, string> = {};
const COLOR_PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#6366f1', // indigo
];

function getClassificationColor(classification: string): string {
  if (!CLASSIFICATION_COLORS[classification]) {
    const idx = Object.keys(CLASSIFICATION_COLORS).length % COLOR_PALETTE.length;
    CLASSIFICATION_COLORS[classification] = COLOR_PALETTE[idx];
  }
  return CLASSIFICATION_COLORS[classification];
}

export interface ClassificationFilterState {
  // All known classifications derived from objects
  classifications: string[];
  // Currently active filter (null = show all, string = filter to one classification)
  activeFilter: string | null;
  // Whether filter view is active
  isFilterActive: boolean;
  // Computed: objects to display (filtered or all)
  filteredObjects: Map<string, CanvasObject>;
  // Computed: grouped positions for filter view
  groupedPositions: Map<string, { left: number; top: number }>;
  // Actions
  setActiveFilter: (classification: string | null) => void;
  enterFilterView: (classification: string | null) => void;
  exitFilterView: () => void;
  addClassification: (name: string) => void;
  removeClassification: (name: string) => void;
  renameClassification: (oldName: string, newName: string) => void;
  getClassificationColor: (classification: string) => string;
  // Custom classifications (user-created)
  customClassifications: string[];
}

// Layout constants for grouped view
const GROUP_HEADER_HEIGHT = 50;
const GROUP_PADDING = 40;
const OBJECT_SPACING = 20;
const OBJECTS_PER_ROW = 4;
const OBJECT_CELL_WIDTH = 220;
const OBJECT_CELL_HEIGHT = 200;

/** Compute the actual bounding box of a single CanvasObject. */
function getObjectBounds(obj: CanvasObject): { left: number; top: number; right: number; bottom: number } {
  const p = obj.props;
  const scaleX = p.scaleX ?? 1;
  const scaleY = p.scaleY ?? 1;
  let w: number, h: number;

  if (obj.type === 'circle') {
    const r = p.radius ?? 50;
    w = r * 2 * scaleX;
    h = r * 2 * scaleY;
  } else {
    w = (p.width ?? 100) * scaleX;
    h = (p.height ?? 100) * scaleY;
  }

  return { left: p.left, top: p.top, right: p.left + w, bottom: p.top + h };
}

/** Compute the bounding box enclosing all objects in a group. */
function getGroupBounds(objects: CanvasObject[]): { left: number; top: number; width: number; height: number } {
  let minLeft = Infinity, minTop = Infinity, maxRight = -Infinity, maxBottom = -Infinity;
  for (const obj of objects) {
    const b = getObjectBounds(obj);
    if (b.left < minLeft) minLeft = b.left;
    if (b.top < minTop) minTop = b.top;
    if (b.right > maxRight) maxRight = b.right;
    if (b.bottom > maxBottom) maxBottom = b.bottom;
  }
  return { left: minLeft, top: minTop, width: maxRight - minLeft, height: maxBottom - minTop };
}

function computeGroupedPositions(
  objects: Map<string, CanvasObject>,
  activeFilter: string | null
): Map<string, { left: number; top: number }> {
  const positions = new Map<string, { left: number; top: number }>();

  // Group objects by classification
  const groups = new Map<string, CanvasObject[]>();
  const unclassified: CanvasObject[] = [];

  objects.forEach((obj) => {
    if (activeFilter !== null) {
      // When filtering to one classification, only show those + unclassified dimmed
      if (obj.classification === activeFilter) {
        const list = groups.get(activeFilter) || [];
        list.push(obj);
        groups.set(activeFilter, list);
      } else {
        unclassified.push(obj);
      }
    } else {
      // Show all, grouped by classification
      const cls = obj.classification || '__unclassified__';
      const list = groups.get(cls) || [];
      list.push(obj);
      groups.set(cls, list);
    }
  });

  // Layout groups vertically
  let currentY = GROUP_PADDING;
  const startX = GROUP_PADDING;

  // Sort group names alphabetically, with unclassified last
  const sortedGroups = Array.from(groups.keys()).sort((a, b) => {
    if (a === '__unclassified__') return 1;
    if (b === '__unclassified__') return -1;
    return a.localeCompare(b);
  });

  for (const groupName of sortedGroups) {
    const groupObjects = groups.get(groupName) || [];
    if (groupObjects.length === 0) continue;

    currentY += GROUP_HEADER_HEIGHT;

    // Translate the group as a rigid body — preserve relative positions
    const groupBounds = getGroupBounds(groupObjects);
    const offsetX = startX - groupBounds.left;
    const offsetY = currentY - groupBounds.top;

    for (const obj of groupObjects) {
      positions.set(obj.id, {
        left: obj.props.left + offsetX,
        top: obj.props.top + offsetY,
      });
    }

    currentY += groupBounds.height + GROUP_PADDING;
  }

  // Position unclassified objects at bottom in compact grid (only in single-filter mode)
  if (activeFilter !== null && unclassified.length > 0) {
    currentY += GROUP_HEADER_HEIGHT;
    unclassified.forEach((obj, idx) => {
      const col = idx % OBJECTS_PER_ROW;
      const row = Math.floor(idx / OBJECTS_PER_ROW);
      positions.set(obj.id, {
        left: startX + col * (OBJECT_CELL_WIDTH + OBJECT_SPACING),
        top: currentY + row * (OBJECT_CELL_HEIGHT + OBJECT_SPACING),
      });
    });
  }

  return positions;
}

export function useClassificationFilter(
  objects: Map<string, CanvasObject>
): ClassificationFilterState {
  const [activeFilter, setActiveFilterState] = useState<string | null>(null);
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [customClassifications, setCustomClassifications] = useState<string[]>([]);

  // Derive all classifications from objects + custom ones
  const classifications = useMemo(() => {
    const classSet = new Set<string>(customClassifications);
    objects.forEach((obj) => {
      if (obj.classification) {
        classSet.add(obj.classification);
      }
    });
    return Array.from(classSet).sort();
  }, [objects, customClassifications]);

  // Compute filtered objects based on active filter
  const filteredObjects = useMemo(() => {
    if (!isFilterActive || activeFilter === null) {
      return objects;
    }
    // In filter view, return all objects (they'll be repositioned, unclassified dimmed)
    return objects;
  }, [objects, activeFilter, isFilterActive]);

  // Compute grouped positions for filter view
  const groupedPositions = useMemo(() => {
    if (!isFilterActive) return new Map();
    return computeGroupedPositions(objects, activeFilter);
  }, [objects, activeFilter, isFilterActive]);

  const setActiveFilter = useCallback((classification: string | null) => {
    setActiveFilterState(classification);
  }, []);

  const enterFilterView = useCallback((classification: string | null) => {
    setActiveFilterState(classification);
    setIsFilterActive(true);
  }, []);

  const exitFilterView = useCallback(() => {
    setIsFilterActive(false);
    setActiveFilterState(null);
    // Position snapshot is kept for restoration by the caller
  }, []);

  const addClassification = useCallback((name: string) => {
    const trimmed = name.trim();
    if (trimmed && !customClassifications.includes(trimmed)) {
      setCustomClassifications((prev) => [...prev, trimmed]);
    }
  }, [customClassifications]);

  const removeClassification = useCallback((name: string) => {
    setCustomClassifications((prev) => prev.filter((c) => c !== name));
    // Note: removing a classification from the list doesn't un-tag objects
    // That's handled separately by the caller
  }, []);

  const renameClassification = useCallback((oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    setCustomClassifications((prev) =>
      prev.map((c) => (c === oldName ? trimmed : c))
    );
    // Note: renaming objects' classifications is handled by the caller
  }, []);

  return {
    classifications,
    activeFilter,
    isFilterActive,
    filteredObjects,
    groupedPositions,
    setActiveFilter,
    enterFilterView,
    exitFilterView,
    addClassification,
    removeClassification,
    renameClassification,
    getClassificationColor,
    customClassifications,
  };
}

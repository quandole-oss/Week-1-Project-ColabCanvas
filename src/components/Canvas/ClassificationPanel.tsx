import { useState, useRef, useEffect } from 'react';
import { Tags, Plus, X, Filter, ArrowLeft, Pencil, Check } from 'lucide-react';

interface ClassificationPanelProps {
  classifications: string[];
  activeFilter: string | null;
  isFilterActive: boolean;
  objectCounts: Map<string, number>;
  getClassificationColor: (classification: string) => string;
  onEnterFilterView: (classification: string | null) => void;
  onExitFilterView: () => void;
  onAddClassification: (name: string) => void;
  onRemoveClassification: (name: string) => void;
  onRenameClassification: (oldName: string, newName: string) => void;
}

export function ClassificationPanel({
  classifications,
  activeFilter,
  isFilterActive,
  objectCounts,
  getClassificationColor,
  onEnterFilterView,
  onExitFilterView,
  onAddClassification,
  onRemoveClassification,
  onRenameClassification,
}: ClassificationPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus input when adding
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Focus edit input
  useEffect(() => {
    if (editingName && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingName]);

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (trimmed) {
      onAddClassification(trimmed);
      setNewName('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    } else if (e.key === 'Escape') {
      setNewName('');
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, oldName: string) => {
    if (e.key === 'Enter') {
      onRenameClassification(oldName, editValue);
      setEditingName(null);
    } else if (e.key === 'Escape') {
      setEditingName(null);
    }
  };

  const totalObjects = Array.from(objectCounts.values()).reduce((sum, c) => sum + c, 0);
  const unclassifiedCount = objectCounts.get('__unclassified__') ?? 0;

  return (
    <div ref={panelRef} className="absolute top-14 right-4 z-30">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition shadow-sm ${
          isFilterActive
            ? 'bg-indigo-500 text-white hover:bg-indigo-600'
            : isOpen
              ? 'bg-white/90 text-gray-800 hover:bg-white border border-gray-200'
              : 'bg-white/70 text-gray-600 hover:bg-white/90 border border-white/30'
        }`}
        title="Classification tags"
      >
        <Tags size={14} strokeWidth={2} />
        <span>Tags</span>
        {isFilterActive && (
          <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">
            {activeFilter || 'All'}
          </span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="mt-2 w-64 bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-gray-200/60 overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Classifications</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{totalObjects} tagged</span>
              <button
                onClick={() => setIsOpen(false)}
                className="p-0.5 text-gray-400 hover:text-gray-600 rounded transition"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Filter view controls */}
          {isFilterActive && (
            <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter size={12} className="text-indigo-500" />
                <span className="text-xs font-medium text-indigo-700">
                  Filtering: {activeFilter || 'All groups'}
                </span>
              </div>
              <button
                onClick={onExitFilterView}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition"
              >
                <ArrowLeft size={12} />
                Exit
              </button>
            </div>
          )}

          {/* Classification list */}
          <div className="px-2 py-2 max-h-72 overflow-y-auto">
            {classifications.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-3">
                No classifications yet. Add one below.
              </p>
            )}

            {/* "All" filter option when filter is active */}
            {isFilterActive && classifications.length > 0 && (
              <button
                onClick={() => onEnterFilterView(null)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition mb-1 ${
                  activeFilter === null
                    ? 'bg-gray-100 text-gray-800 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="w-3 h-3 rounded-full bg-gray-400" />
                <span className="flex-1 text-left">All groups</span>
                <span className="text-xs text-gray-400">{totalObjects - unclassifiedCount}</span>
              </button>
            )}

            {classifications.map((cls) => {
              const color = getClassificationColor(cls);
              const count = objectCounts.get(cls) ?? 0;
              const isActive = activeFilter === cls;

              return (
                <div
                  key={cls}
                  className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition mb-0.5 ${
                    isActive ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Color dot */}
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />

                  {/* Name (editable) */}
                  {editingName === cls ? (
                    <div className="flex-1 flex items-center gap-1">
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => handleEditKeyDown(e, cls)}
                        onBlur={() => {
                          onRenameClassification(cls, editValue);
                          setEditingName(null);
                        }}
                        className="flex-1 text-sm bg-white border border-gray-300 rounded px-1.5 py-0.5 outline-none focus:border-indigo-400"
                      />
                      <button
                        onClick={() => {
                          onRenameClassification(cls, editValue);
                          setEditingName(null);
                        }}
                        className="text-green-500 hover:text-green-700"
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="flex-1 text-left text-gray-700 truncate"
                      onClick={() => {
                        if (isFilterActive) {
                          onEnterFilterView(cls);
                        } else {
                          onEnterFilterView(cls);
                        }
                      }}
                    >
                      {cls}
                    </button>
                  )}

                  {/* Count badge */}
                  <span className="text-xs text-gray-400 flex-shrink-0">{count}</span>

                  {/* Actions (visible on hover) */}
                  {editingName !== cls && (
                    <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingName(cls);
                          setEditValue(cls);
                        }}
                        className="p-0.5 text-gray-400 hover:text-gray-600 rounded transition"
                        title="Rename"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveClassification(cls);
                        }}
                        className="p-0.5 text-gray-400 hover:text-red-500 rounded transition"
                        title="Remove"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unclassified count */}
            {unclassifiedCount > 0 && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-gray-400 mt-1 border-t border-gray-100 pt-2">
                <div className="w-3 h-3 rounded-full bg-gray-300" />
                <span className="flex-1">Unclassified</span>
                <span className="text-xs">{unclassifiedCount}</span>
              </div>
            )}
          </div>

          {/* Add new classification */}
          <div className="px-3 py-2.5 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="New classification..."
                className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400 focus:bg-white transition placeholder:text-gray-300"
              />
              <button
                onClick={handleAdd}
                disabled={!newName.trim()}
                className="p-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Add classification"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Quick filter button */}
          {!isFilterActive && classifications.length > 0 && (
            <div className="px-3 py-2 border-t border-gray-100">
              <button
                onClick={() => onEnterFilterView(null)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition"
              >
                <Filter size={13} />
                Enter Filter View
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

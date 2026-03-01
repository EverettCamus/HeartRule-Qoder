import { message } from 'antd';
import { useCallback, useEffect, useRef } from 'react';

import type { PhaseWithTopics } from '../services/YamlService';
import type { FocusPath } from '../utils/history-manager';
import { globalHistoryManager } from '../utils/history-manager';

/**
 * 历史操作配置接口
 */
export interface HistoryOperationsConfig {
  // 状态
  currentPhases: PhaseWithTopics[];
  setCurrentPhases: (
    phases: PhaseWithTopics[] | ((prev: PhaseWithTopics[]) => PhaseWithTopics[])
  ) => void;
  setHasUnsavedChanges: (changed: boolean) => void;

  // 文件相关
  selectedFile: any;
  files: any[];
  setSelectedFile: (file: any) => void;
  setSelectedKeys: (keys: string[]) => void;

  // 焦点状态
  setSelectedActionPath: (path: any) => void;
  setSelectedPhasePath: (path: any) => void;
  setSelectedTopicPath: (path: any) => void;
  setEditingType: (type: 'phase' | 'topic' | 'action' | null) => void;

  // 编辑器模式
  setEditMode: (mode: 'visual' | 'yaml') => void;

  // YAML 同步
  syncPhasesToYaml: (phases: PhaseWithTopics[], targetFileId?: string) => void;

  // ActionNodeList 引用
  actionNodeListRef: React.RefObject<any>;

  // selectedFile 引用（用于获取最新值）
  selectedFileRef: React.RefObject<any>;
}

/**
 * 历史操作接口
 */
export interface HistoryOperations {
  handleUndo: () => void;
  handleRedo: () => void;
  pushHistory: (
    beforePhases: PhaseWithTopics[],
    afterPhases: PhaseWithTopics[],
    operation: string,
    beforeFocusPath?: FocusPath | null,
    afterFocusPath?: FocusPath | null
  ) => void;
}

/**
 * 历史操作 Hook
 *
 * 功能：
 * 1. 管理 Undo/Redo 历史栈
 * 2. 处理跨文件 Undo/Redo
 * 3. 焦点导航自动恢复
 * 4. 初始状态自动推送
 * 5. 快捷键监听 (Ctrl+Z / Ctrl+Y)
 *
 * 重构说明：
 * - 从 ProjectEditor/index.tsx 提取约 400 行代码到独立 Hook
 * - 包含历史管理、Undo/Redo、焦点导航等逻辑
 */
export function useHistoryOperations(config: HistoryOperationsConfig): HistoryOperations {
  const {
    currentPhases,
    setCurrentPhases,
    setHasUnsavedChanges,
    selectedFile,
    files,
    setSelectedFile,
    setSelectedKeys,
    setSelectedActionPath,
    setSelectedPhasePath,
    setSelectedTopicPath,
    setEditingType,
    setEditMode,
    syncPhasesToYaml,
    actionNodeListRef,
    selectedFileRef,
  } = config;

  // Refs
  const processingUndoRedoRef = useRef<boolean>(false);
  const initialStatePushedRef = useRef<Set<string>>(new Set());

  /**
   * 推送历史记录（需求4 - 使用全局历史管理器）
   * 修改为接收 before/after 双快照
   */
  const pushHistory = useCallback(
    (
      beforePhases: PhaseWithTopics[],
      afterPhases: PhaseWithTopics[],
      operation: string,
      beforeFocusPath: FocusPath | null = null,
      afterFocusPath: FocusPath | null = null
    ) => {
      if (!selectedFile) {
        console.warn('[pushHistory] selectedFile 为空，跳过历史记录推送');
        return;
      }

      globalHistoryManager.push({
        fileId: selectedFile.id,
        fileName: selectedFile.fileName,
        beforePhases: beforePhases,
        afterPhases: afterPhases,
        operation,
        beforeFocusPath,
        afterFocusPath,
        timestamp: Date.now(),
      });

      console.log(`[pushHistory] 推送历史记录: ${operation} (fileId: ${selectedFile.id})`);
    },
    [selectedFile]
  );

  /**
   * 应用焦点导航
   * 注意：不再负责切换文件，只负责设置焦点和展开节点
   */
  const applyFocusNavigation = useCallback(
    (focusPath: FocusPath | null, _targetFileId: string) => {
      if (!focusPath) {
        console.log('[FocusNavigation] ⚠️ 无焦点信息，跳过');
        return;
      }

      console.log(
        `[FocusNavigation] 应用焦点导航: type=${focusPath.type}, phaseIndex=${focusPath.phaseIndex}, topicIndex=${focusPath.topicIndex}`
      );

      // 清空所有焦点
      setSelectedActionPath(null);
      setSelectedPhasePath(null);
      setSelectedTopicPath(null);

      // 根据类型设置焦点
      if (focusPath.type === 'action' && focusPath.actionIndex !== undefined) {
        setSelectedActionPath({
          phaseIndex: focusPath.phaseIndex,
          topicIndex: focusPath.topicIndex!,
          actionIndex: focusPath.actionIndex,
        });
        setEditingType('action');
        console.log(`[FocusNavigation] ✅ 设置焦点到 Action: ${focusPath.actionIndex}`);

        // 使用 ref 调用 ensureActionVisible
        if (actionNodeListRef?.current?.ensureActionVisible) {
          setTimeout(() => {
            actionNodeListRef.current!.ensureActionVisible!(
              focusPath.phaseIndex,
              focusPath.topicIndex!,
              focusPath.actionIndex!
            );
            console.log('[FocusNavigation] 📍 ensureActionVisible 调用完成');
          }, 100);
        }
      } else if (focusPath.type === 'topic') {
        setSelectedTopicPath({
          phaseIndex: focusPath.phaseIndex,
          topicIndex: focusPath.topicIndex!,
        });
        setEditingType('topic');
        console.log(`[FocusNavigation] ✅ 设置焦点到 Topic: ${focusPath.topicIndex}`);
      } else if (focusPath.type === 'phase') {
        setSelectedPhasePath({
          phaseIndex: focusPath.phaseIndex,
        });
        setEditingType('phase');
        console.log(`[FocusNavigation] ✅ 设置焦点到 Phase: ${focusPath.phaseIndex}`);
      }
    },
    [
      setSelectedActionPath,
      setSelectedPhasePath,
      setSelectedTopicPath,
      setEditingType,
      actionNodeListRef,
    ]
  );

  /**
   * Undo 操作（需求4 - 使用全局历史管理器）
   * 关键修复：使用 entry.beforePhases 恢复到操作前状态
   */
  const handleUndo = useCallback(() => {
    console.log('\n========== [Undo] 开始执行 ==========');
    console.log(`[Undo] 锁状态: ${processingUndoRedoRef.current}`);

    // 防止并发执行
    if (processingUndoRedoRef.current) {
      console.log('[Undo] ❌ 正在处理上一个操作，请稍候');
      return;
    }

    const entry = globalHistoryManager.undo();
    if (!entry) {
      message.info('Already at the oldest state');
      console.log('========== [Undo] 已到最早状态 ==========\n');
      return;
    }

    console.log(`[Undo] 📋 操作类型: ${entry.operation}`);
    console.log(`[Undo] 📂 目标文件ID: ${entry.fileId}`);
    console.log(`[Undo] 📊 beforePhases 长度: ${entry.beforePhases.length}`);

    // 使用 ref 获取最新的 selectedFile
    const currentFile = selectedFileRef.current;
    console.log(`[Undo] 📌 当前文件: ${currentFile?.fileName} (id: ${currentFile?.id})`);
    console.log(
      `[Undo] 🔍 文件匹配检查: ${currentFile?.id} === ${entry.fileId} ? ${currentFile?.id === entry.fileId}`
    );

    processingUndoRedoRef.current = true;
    console.log('[Undo] 🔒 已加锁');

    // 关键修复：使用 beforePhases 恢复到操作前状态
    const phasesToRestore = entry.beforePhases;
    const focusToRestore = entry.beforeFocusPath;

    console.log(`[Undo] 📦 准备恢复的 Phases 数量: ${phasesToRestore.length}`);
    console.log(`[Undo] 🎯 焦点路径:`, focusToRestore);

    // 检查文件是否匹配
    if (currentFile?.id !== entry.fileId) {
      console.log('[Undo] ⚠️ 检测到跨文件操作');
      const targetFile = files.find((f) => f.id === entry.fileId);

      if (targetFile) {
        console.log(`[Undo] 🔄 切换文件: ${currentFile?.fileName} -> ${targetFile.fileName}`);

        // 直接更新所有状态
        setSelectedFile(targetFile);
        setSelectedKeys([targetFile.id]);
        setSelectedActionPath(null);
        setSelectedPhasePath(null);
        setSelectedTopicPath(null);
        setEditingType(null);
        console.log('[Undo] ✅ 文件切换状态已更新');

        // 等待 React 批量更新完成
        setTimeout(() => {
          console.log(`[Undo-Timeout] 🚀 开始恢复数据到: ${targetFile.fileName}`);
          console.log(`[Undo-Timeout] 📊 beforePhases 长度: ${phasesToRestore.length}`);

          // 直接恢复历史数据
          setCurrentPhases(phasesToRestore);
          console.log('[Undo-Timeout] ✅ setCurrentPhases 调用完成');

          // 关键修复：跨文件时传入 targetFile.id
          syncPhasesToYaml(phasesToRestore, targetFile.id);
          console.log('[Undo-Timeout] ✅ syncPhasesToYaml 调用完成（跨文件）');

          setHasUnsavedChanges(true);
          setEditMode('visual');
          console.log('[Undo-Timeout] ✅ 编辑状态已更新');

          // 应用焦点导航
          console.log('[Undo-Timeout] 🎯 应用焦点导航...');
          applyFocusNavigation(focusToRestore, entry.fileId);

          message.success(`Undone: ${entry.operation} (${targetFile.fileName})`);

          // 释放锁
          processingUndoRedoRef.current = false;
          console.log('[Undo-Timeout] 🔓 释放锁');
          console.log('========== [Undo] 跨文件操作完成 ==========\n');
        }, 350);
      } else {
        console.error(`[Undo] ❌ 无法找到目标文件，fileId: ${entry.fileId}`);
        console.error(
          '[Undo] 可用文件列表:',
          files.map((f) => ({ id: f.id, name: f.fileName }))
        );
        message.error('Target file not found');
        processingUndoRedoRef.current = false;
        globalHistoryManager.resetUndoRedoFlag();
        console.log('========== [Undo] 失败结束 ==========\n');
        return;
      }
    } else {
      // 同一文件，直接恢复数据
      console.log(`[Undo] 📝 同文件恢复: ${currentFile?.fileName}`);
      console.log(`[Undo] 📊 当前 currentPhases 长度: ${currentPhases.length}`);
      console.log(`[Undo] 📊 准备恢复的 Phases 长度: ${phasesToRestore.length}`);

      if (phasesToRestore.length === 0) {
        console.warn('[Undo] ⚠️ beforePhases 为空数组，可能回到初始状态');
      }

      // 详细日志：对比第一个 Phase
      if (phasesToRestore.length > 0 && currentPhases.length > 0) {
        console.log('[Undo] 对比第一个 Phase:');
        console.log('  当前:', {
          id: currentPhases[0]?.phase_id,
          name: currentPhases[0]?.phase_name,
          topicsCount: currentPhases[0]?.topics?.length,
        });
        console.log('  恢复目标:', {
          id: phasesToRestore[0]?.phase_id,
          name: phasesToRestore[0]?.phase_name,
          topicsCount: phasesToRestore[0]?.topics?.length,
        });
      }

      setCurrentPhases(phasesToRestore);
      console.log('[Undo] ✅ setCurrentPhases 调用完成');

      syncPhasesToYaml(phasesToRestore);
      console.log('[Undo] ✅ syncPhasesToYaml 调用完成');

      setHasUnsavedChanges(true);

      // 应用焦点导航
      applyFocusNavigation(focusToRestore, entry.fileId);

      message.success(`Undone: ${entry.operation}`);

      // 释放锁
      processingUndoRedoRef.current = false;
      console.log('[Undo] 🔓 释放锁');
      console.log('========== [Undo] 同文件操作完成 ==========\n');
    }

    // 重置标记
    setTimeout(() => globalHistoryManager.resetUndoRedoFlag(), 100);
  }, [
    files,
    currentPhases,
    syncPhasesToYaml,
    applyFocusNavigation,
    setCurrentPhases,
    setSelectedFile,
    setSelectedKeys,
    setSelectedActionPath,
    setSelectedPhasePath,
    setSelectedTopicPath,
    setEditingType,
    setEditMode,
    setHasUnsavedChanges,
    selectedFileRef,
  ]);

  /**
   * Redo 操作（需求4 - 使用全局历史管理器）
   * 关键修复：使用 entry.afterPhases 恢复到操作后状态
   */
  const handleRedo = useCallback(() => {
    // 防止并发执行
    if (processingUndoRedoRef.current) {
      console.log('[Redo] 正在处理上一个操作，请稍候');
      return;
    }

    const entry = globalHistoryManager.redo();
    if (!entry) {
      message.info('Already at the latest state');
      return;
    }

    // 使用 ref 获取最新的 selectedFile
    const currentFile = selectedFileRef.current;
    console.log(`[Redo] 当前文件: ${currentFile?.fileName}, 目标文件ID: ${entry.fileId}`);

    processingUndoRedoRef.current = true;

    // 关键修复：使用 afterPhases 恢复到操作后状态
    const phasesToRestore = entry.afterPhases;
    const focusToRestore = entry.afterFocusPath;

    // 检查文件是否匹配
    if (currentFile?.id !== entry.fileId) {
      const targetFile = files.find((f) => f.id === entry.fileId);
      if (targetFile) {
        console.log(`[Redo] 需要切换文件: ${currentFile?.fileName} -> ${targetFile.fileName}`);

        // 直接更新所有状态
        setSelectedFile(targetFile);
        setSelectedKeys([targetFile.id]);
        setSelectedActionPath(null);
        setSelectedPhasePath(null);
        setSelectedTopicPath(null);
        setEditingType(null);

        // 等待 React 批量更新完成
        setTimeout(() => {
          console.log(`[Redo] 开始恢复数据到: ${targetFile.fileName}`);
          console.log(`[Redo] afterPhases 长度: ${phasesToRestore.length}`);

          // 直接恢复历史数据
          setCurrentPhases(phasesToRestore);
          // 关键修复：跨文件时传入 targetFile.id
          syncPhasesToYaml(phasesToRestore, targetFile.id);
          setHasUnsavedChanges(true);
          setEditMode('visual');

          // 应用焦点导航
          applyFocusNavigation(focusToRestore, entry.fileId);

          message.success(`Redone: ${entry.operation} (${targetFile.fileName})`);

          // 释放锁
          processingUndoRedoRef.current = false;
          console.log('[Redo] 操作完成，释放锁');
        }, 350);
      } else {
        console.error(`[Redo] 无法找到目标文件，fileId: ${entry.fileId}`);
        message.error('Target file not found');
        processingUndoRedoRef.current = false;
        globalHistoryManager.resetUndoRedoFlag();
        return;
      }
    } else {
      // 同一文件，直接恢复数据
      console.log(`[Redo] 同文件恢复: ${currentFile?.fileName}`);
      setCurrentPhases(phasesToRestore);
      syncPhasesToYaml(phasesToRestore);
      setHasUnsavedChanges(true);

      // 应用焦点导航
      applyFocusNavigation(focusToRestore, entry.fileId);

      message.success(`Redone: ${entry.operation}`);

      // 释放锁
      processingUndoRedoRef.current = false;
      console.log('[Redo] 同文件操作完成');
    }

    // 重置标记
    setTimeout(() => globalHistoryManager.resetUndoRedoFlag(), 100);
  }, [
    files,
    syncPhasesToYaml,
    applyFocusNavigation,
    setCurrentPhases,
    setSelectedFile,
    setSelectedKeys,
    setSelectedActionPath,
    setSelectedPhasePath,
    setSelectedTopicPath,
    setEditingType,
    setEditMode,
    setHasUnsavedChanges,
    selectedFileRef,
  ]);

  // ========== 初始状态推送 ==========

  /**
   * 监听 currentPhases 和 selectedFile，在首次加载时推入初始状态
   */
  useEffect(() => {
    if (!selectedFile || currentPhases.length === 0) {
      return;
    }

    // 检查是否已经为该文件推入过初始状态
    if (initialStatePushedRef.current.has(selectedFile.id)) {
      return;
    }

    // 检查历史栈中是否已有该文件的记录
    const hasHistory = globalHistoryManager.getEntries().some((e) => e.fileId === selectedFile.id);
    if (hasHistory) {
      console.log(`[InitialState] 文件 ${selectedFile.fileName} 已有历史记录，跳过`);
      initialStatePushedRef.current.add(selectedFile.id);
      return;
    }

    // 计算一个合理的初始焦点（如果存在Action）
    let initialFocus: FocusPath | null = null;
    if (
      currentPhases[0]?.topics &&
      currentPhases[0].topics[0]?.actions &&
      currentPhases[0].topics[0].actions.length > 0
    ) {
      initialFocus = {
        phaseIndex: 0,
        topicIndex: 0,
        actionIndex: 0,
        type: 'action',
      };
    } else if (currentPhases[0]?.topics && currentPhases[0].topics[0]) {
      initialFocus = {
        phaseIndex: 0,
        topicIndex: 0,
        type: 'topic',
      };
    } else if (currentPhases[0]) {
      initialFocus = {
        phaseIndex: 0,
        type: 'phase',
      };
    }

    console.log(
      `[InitialState] 推入初始状态 (文件: ${selectedFile.fileName}, phases: ${currentPhases.length})`
    );
    globalHistoryManager.push({
      fileId: selectedFile.id,
      fileName: selectedFile.fileName,
      beforePhases: [],
      afterPhases: JSON.parse(JSON.stringify(currentPhases)),
      operation: 'Initial Load',
      beforeFocusPath: null,
      afterFocusPath: initialFocus,
      timestamp: Date.now(),
    });

    initialStatePushedRef.current.add(selectedFile.id);
  }, [currentPhases, selectedFile]);

  // ========== 快捷键监听 ==========

  /**
   * 监听全局键盘事件，处理 Undo/Redo 快捷键
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z: Undo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl+Y 或 Ctrl+Shift+Z: Redo
      else if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  return {
    handleUndo,
    handleRedo,
    pushHistory,
  };
}

import { Modal, Input, InputNumber, Select, Button, List, Tag, Space, message } from 'antd';
import React, { useState, useEffect, useMemo } from 'react';
import './style.css';

const { TextArea } = Input;

interface VersionEntry {
  versionId: string;
  actionId: string;
  timestamp: string;
  config: {
    content?: string;
    tone?: string;
    max_rounds?: number;
    output?: any[];
  };
  llmConfig?: {
    provider?: string;
    model?: string;
    temperature?: number;
  };
  result?: {
    roundsUsed: number;
    exitReason: string;
    variableCount: number;
  };
  writtenBack?: boolean;
}

interface RerunModalProps {
  visible: boolean;
  actionId: string;
  actionType: string;
  actionConfig: Record<string, any>;
  sessionDetail: any; // for scriptId and metadata
  versions: VersionEntry[];
  mode: 'rerun' | 'rollback';
  targetInfo?: {
    phasePath: string;
    snapshotTime: string;
    messagesToClear: number;
    actionsToClear: string[];
  };
  onConfirm: (data: any) => Promise<void>;
  onWriteBack: (
    versionId: string,
    config: Record<string, any>,
    llmConfig?: Record<string, any>
  ) => Promise<void>;
  onCancel: () => void;
}

const LLM_PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'volcano', label: 'Volcano (火山引擎)' },
];

const RerunModal: React.FC<RerunModalProps> = ({
  visible,
  actionId,
  actionType: _actionType,
  actionConfig,
  sessionDetail: _sessionDetail,
  versions,
  mode,
  targetInfo,
  onConfirm,
  onWriteBack,
  onCancel,
}) => {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [writeBackLoading, setWriteBackLoading] = useState(false);

  // Editable fields
  const [prompt, setPrompt] = useState(actionConfig?.content || '');
  const [tone, setTone] = useState(actionConfig?.tone || '');
  const [maxRounds, setMaxRounds] = useState(actionConfig?.max_rounds || 20);
  const [provider, setProvider] = useState('deepseek');
  const [model, setModel] = useState('deepseek-v4-flash');
  const [temperature, setTemperature] = useState(0.7);

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setPrompt(actionConfig?.content || '');
      setTone(actionConfig?.tone || '');
      setMaxRounds(actionConfig?.max_rounds || 20);
      setSelectedVersionId(null);
    }
  }, [visible, actionConfig]);

  // When a version is selected, fill form from that version
  const handleSelectVersion = (version: VersionEntry) => {
    setSelectedVersionId(version.versionId);
    setPrompt(version.config?.content || actionConfig?.content || '');
    setTone(version.config?.tone || actionConfig?.tone || '');
    setMaxRounds(version.config?.max_rounds || actionConfig?.max_rounds || 20);
    if (version.llmConfig) {
      setProvider(version.llmConfig.provider || 'deepseek');
      setModel(version.llmConfig.model || 'deepseek-v4-flash');
      setTemperature(version.llmConfig.temperature ?? 0.7);
    }
  };

  const handleConfirm = async () => {
    setConfirmLoading(true);
    try {
      const data = {
        config: {
          content: prompt,
          tone: tone || undefined,
          max_rounds: maxRounds,
        },
        llmConfig: {
          provider,
          model,
          temperature,
        },
      };
      await onConfirm(data);
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleWriteBack = async () => {
    if (!selectedVersionId) {
      message.warning('请先选择一个版本');
      return;
    }
    const version = versions.find((v) => v.versionId === selectedVersionId);
    if (!version) return;

    setWriteBackLoading(true);
    try {
      await onWriteBack(selectedVersionId, version.config, version.llmConfig);
    } finally {
      setWriteBackLoading(false);
    }
  };

  const sortedVersions = useMemo(
    () =>
      [...versions].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    [versions]
  );

  return (
    <Modal
      title={mode === 'rerun' ? `重运行当前 Action` : `回退到 ${actionId}`}
      open={visible}
      onCancel={onCancel}
      width={700}
      footer={null}
      destroyOnClose
    >
      <div className="rerun-modal">
        {/* Rollback warning */}
        {mode === 'rollback' && targetInfo && (
          <div className="rerun-modal__warning">
            <div className="rerun-modal__warning-title">回退点信息</div>
            <div>{targetInfo.phasePath}</div>
            <div>快照时间: {targetInfo.snapshotTime}</div>
            <div style={{ marginTop: 8 }}>
              将清除以下内容：
              <ul>
                <li>{targetInfo.messagesToClear} 条对话消息</li>
                {targetInfo.actionsToClear.map((a) => (
                  <li key={a}>{a} 的变量和执行状态</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Version history (rerun mode only) */}
        {mode === 'rerun' && sortedVersions.length > 0 && (
          <div className="rerun-modal__section">
            <div className="rerun-modal__section-title">配置版本</div>
            <List
              size="small"
              dataSource={sortedVersions}
              renderItem={(version) => (
                <List.Item
                  className={`rerun-modal__version-item ${selectedVersionId === version.versionId ? 'rerun-modal__version-item--selected' : ''}`}
                  onClick={() => handleSelectVersion(version)}
                >
                  <div style={{ width: '100%' }}>
                    <Space>
                      <Tag color={selectedVersionId === version.versionId ? 'blue' : 'default'}>
                        {version.versionId === sortedVersions[sortedVersions.length - 1]?.versionId
                          ? 'v1 (原始)'
                          : `v${sortedVersions.indexOf(version) + 1}`}
                      </Tag>
                      <span>{new Date(version.timestamp).toLocaleString()}</span>
                      {version.result && (
                        <span>
                          {version.result.roundsUsed}轮/{version.result.exitReason}
                        </span>
                      )}
                      {version.writtenBack && <Tag color="green">已回写</Tag>}
                    </Space>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                      prompt: &quot;{version.config?.content?.substring(0, 50)}...&quot;
                      {version.llmConfig &&
                        `  LLM: ${version.llmConfig.model} temp=${version.llmConfig.temperature}`}
                    </div>
                  </div>
                </List.Item>
              )}
              style={{ maxHeight: 200, overflow: 'auto' }}
            />
          </div>
        )}

        {/* Edit config */}
        <div className="rerun-modal__section">
          <div className="rerun-modal__section-title">编辑配置</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 4 }}>Prompt:</div>
            <TextArea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="输入新的 prompt 内容..."
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 4 }}>Tone:</div>
            <Input
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="如：平和，简洁，有趣"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 4 }}>Max Rounds:</div>
            <InputNumber
              value={maxRounds}
              onChange={(v) => setMaxRounds(v || 20)}
              min={1}
              max={500}
            />
          </div>
        </div>

        {/* LLM settings */}
        <div className="rerun-modal__section">
          <div className="rerun-modal__section-title">LLM 设置</div>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <div style={{ marginBottom: 4 }}>Provider:</div>
              <Select
                value={provider}
                onChange={setProvider}
                options={LLM_PROVIDERS}
                style={{ width: 200 }}
              />
            </div>
            <div>
              <div style={{ marginBottom: 4 }}>Model:</div>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="deepseek-v4-flash"
                style={{ width: 300 }}
              />
            </div>
            <div>
              <div style={{ marginBottom: 4 }}>Temperature:</div>
              <InputNumber
                value={temperature}
                onChange={(v) => setTemperature(v || 0.7)}
                min={0}
                max={2}
                step={0.1}
              />
            </div>
          </Space>
        </div>

        {/* Warning */}
        <div className="rerun-modal__warning">
          {mode === 'rerun'
            ? '将回退到 Action 起点，并清除本 Action 的消息'
            : '将回退到该 Action 起点，并清除之后的所有消息和变量'}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <div>
            {mode === 'rerun' && selectedVersionId && (
              <Button onClick={handleWriteBack} loading={writeBackLoading}>
                回写到脚本
              </Button>
            )}
          </div>
          <Space>
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" onClick={handleConfirm} loading={confirmLoading}>
              {mode === 'rerun' ? '确认重运行' : '确认回退'}
            </Button>
          </Space>
        </div>
      </div>
    </Modal>
  );
};

export default RerunModal;

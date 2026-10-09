import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { JEV_DEFAULT_ENDPOINT, JEV_DEFAULT_MODEL } from '@/game/jev';
import type { AiEngine, PlayMode } from '@/game/engine';

export interface AppSettings {
  apiKey: string;
  endpoint: string;
  model: string;
  aiEngine: AiEngine;
  aiSpeed: number; // 每步毫秒
  mode: PlayMode;
}

const LS_KEY = 'tetris3d.settings.v1';

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        apiKey: s.apiKey ?? '',
        endpoint: s.endpoint ?? JEV_DEFAULT_ENDPOINT,
        model: s.model ?? JEV_DEFAULT_MODEL,
        aiEngine: s.aiEngine === 'jev' ? 'jev' : 'builtin',
        aiSpeed: typeof s.aiSpeed === 'number' ? s.aiSpeed : 200,
        mode: s.mode === 'ai' ? 'ai' : 'human',
      };
    }
  } catch { /* ignore */ }
  return {
    apiKey: '',
    endpoint: JEV_DEFAULT_ENDPOINT,
    model: JEV_DEFAULT_MODEL,
    aiEngine: 'jev',
    aiSpeed: 200,
    mode: 'human',
  };
}

export function saveSettings(s: AppSettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
}

export function SettingsDialog({ open, onOpenChange, settings, onSave }: Props) {
  const [draft, setDraft] = useState<AppSettings>(settings);

  // 打开时同步最新设置
  const handleOpen = (o: boolean) => {
    if (o) setDraft(settings);
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="panel border-[#5660ff]/50 text-[#f3f3f3] sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-pixel text-sm text-[#7c86ff] neon-text">设置 / SETTINGS</DialogTitle>
          <DialogDescription className="text-xs text-[#9aa0d0]">
            Jev API Key 仅保存在当前浏览器的 localStorage 中，不会硬编码进程序。AI 决策时，Key 随请求经本站后端代理转发至上方配置的 Endpoint，服务端不存储、不记录。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 text-sm">
          <div className="space-y-2">
            <Label htmlFor="jev-key" className="text-[#7c86ff]">Jev API Key</Label>
            <Input
              id="jev-key"
              type="password"
              placeholder="粘贴你的 Jev API Key（留空则 AI 使用内置引擎）"
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              className="bg-[#070a24] border-[#5660ff]/40 font-mono text-xs"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="jev-endpoint" className="text-[#7c86ff]">API Endpoint</Label>
            <Input
              id="jev-endpoint"
              placeholder={JEV_DEFAULT_ENDPOINT}
              value={draft.endpoint}
              onChange={(e) => setDraft({ ...draft, endpoint: e.target.value })}
              className="bg-[#070a24] border-[#5660ff]/40 font-mono text-xs"
            />
            <p className="text-[11px] text-[#6a70a8] leading-relaxed">
              上游 Jev API 地址，默认 {JEV_DEFAULT_ENDPOINT}。浏览器请求经由本站后端代理转发，不受跨域限制；如使用自建网关可在此修改。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="jev-model" className="text-[#7c86ff]">模型</Label>
            <Input
              id="jev-model"
              placeholder={JEV_DEFAULT_MODEL}
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              className="bg-[#070a24] border-[#5660ff]/40 font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[#7c86ff]">AI 决策引擎</Label>
            <div className="flex gap-2">
              {([['jev', 'JEV 模型'], ['builtin', '内置启发式']] as [AiEngine, string][]).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setDraft({ ...draft, aiEngine: v })}
                  className={`flex-1 px-3 py-2 text-xs border transition-colors ${
                    draft.aiEngine === v
                      ? 'border-[#5660ff] bg-[#3834ff]/25 text-white'
                      : 'border-[#5660ff]/30 text-[#9aa0d0] hover:border-[#5660ff]/70'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[#7c86ff]">AI 动作速度：{draft.aiSpeed}ms / 步</Label>
            <Slider
              value={[draft.aiSpeed]}
              min={10}
              max={400}
              step={10}
              onValueChange={([v]) => setDraft({ ...draft, aiSpeed: v })}
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <Button
              variant="ghost"
              className="text-[#ff624d] hover:text-[#ff624d] hover:bg-[#ff624d]/10 text-xs"
              onClick={() => setDraft({ ...draft, apiKey: '' })}
            >
              清除已存密钥
            </Button>
            <Button
              className="bg-[#3834ff] hover:bg-[#4a46ff] text-white font-pixel text-[10px]"
              onClick={() => { onSave(draft); onOpenChange(false); }}
            >
              保存
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

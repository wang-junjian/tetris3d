import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-pixel text-[11px] text-[#7c86ff]">{title}</h3>
      <div className="text-xs leading-relaxed text-[#c6cbe8] space-y-1.5">{children}</div>
    </section>
  );
}

export function HelpDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="panel border-[#5660ff]/50 text-[#f3f3f3] sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-pixel text-sm text-[#7c86ff] neon-text">帮助 / HELP</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <Section title="这是什么">
            <p>
              TETRIS·3D 是一款 3D 俄罗斯方块：方块在发光机柜深井中下落，填满整行即消除得分，
              堆到顶部游戏结束。支持<strong className="text-white">人类手动</strong>和
              <strong className="text-white"> AI 代玩</strong>两种模式，AI 由 TypeSafe 的 Jev 模型（System One）或内置启发式引擎驱动。
            </p>
          </Section>

          <Section title="怎么开始">
            <p>1. 点右上角「开始」（或按 Enter）开局。</p>
            <p>2. 左侧切「人类 / AI」选择谁来玩，可随时中途切换。</p>
            <p>3. 拖动画面可小范围旋转视角；拖动不会影响到游戏判定。</p>
          </Section>

          <Section title="键盘操作（电脑）">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
              <span>← →</span><span className="text-[#9aa0d0]">左右移动</span>
              <span>↑ / X</span><span className="text-[#9aa0d0]">顺时针旋转</span>
              <span>Z</span><span className="text-[#9aa0d0]">逆时针旋转</span>
              <span>↓</span><span className="text-[#9aa0d0]">软降（加速下落）</span>
              <span>空格</span><span className="text-[#9aa0d0]">硬降（直接落底）</span>
              <span>P</span><span className="text-[#9aa0d0]">暂停 / 继续</span>
              <span>Enter</span><span className="text-[#9aa0d0]">开始 / 重开</span>
            </div>
          </Section>

          <Section title="手机操作">
            <p>人类模式下屏幕底部会出现触控按钮：左右移动、旋转、软降、硬降。</p>
            <p>右上角「数据」可打开抽屉查看下一个方块（NEXT）和 AI 决策日志。</p>
          </Section>

          <Section title="AI 模式与决策引擎">
            <p>
              <strong className="text-[#c6d32d]">内置启发式</strong>：本地算法实时评估所有落点
              （空洞、高度、平整度、消行），无需联网，立刻可用。
            </p>
            <p>
              <strong className="text-[#ffa7f0]">JEV 模型</strong>：每步把棋盘状态和 Top 候选落点发给
              Jev，由它的 Choice 原语选出最优解，日志里能看到每步的置信度。
              请求超时、出错或置信度过低时自动回退内置引擎，游戏不中断。
            </p>
            <p>在「设置」里切换引擎、调整 AI 动作速度（默认 200ms/步）。</p>
          </Section>

          <Section title="配置 Jev API Key">
            <p>1. 点右上角「设置」。</p>
            <p>2. 把你的 Jev API Key 粘贴到「Jev API Key」输入框，保存。</p>
            <p>3. AI 引擎选「JEV 模型」即可。</p>
            <p className="text-[#6a70a8]">
              Key 只保存在你自己浏览器的 localStorage，不硬编码在程序里；决策请求经本站后端代理转发到
              Jev API（解决浏览器跨域限制），服务端不存储、不记录 Key。清除浏览器数据或换设备后需要重新填写。
            </p>
          </Section>

          <Section title="常见问题">
            <p><strong className="text-white">AI 日志提示"未配置 API Key"？</strong>说明引擎选了 JEV 但没填 Key，已自动用内置引擎代打；填 Key 后即走 Jev。</p>
            <p><strong className="text-white">堆到高位时顶部红线闪？</strong>那是危险线报警，提示离顶出不远了。</p>
            <p><strong className="text-white">视角歪了？</strong>旋转范围已限制在可读区间；刷新页面可复位相机。</p>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

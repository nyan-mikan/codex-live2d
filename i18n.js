/* Shared UI translations. Model labels and assistant text stay user-authored. */
(() => {
  const english = {
  "仅在聊天界面启用": "Enable only in chat",
  "打开临时侧栏、应用设置或非聊天页面时自动隐藏；常驻聊天列表不影响显示。": "Hide when a temporary sidebar, app settings, or a non-chat page is open. The docked chat list does not hide the model.",
  "Live2D 角色": "Live2D companion",
  "Live2D 角色 Live2D": "Live2D companion",
  "Live2D 角色动态模型": "Animated Live2D model",
  "语言": "Language",
  "正在加载模型…": "Loading model…",
  "暂停": "Pause",
  "继续": "Resume",
  "跟随": "Mouse tracking",
  "互动": "Interaction",
  "开": "On",
  "关": "Off",
  "表情": "Expressions",
  "自然": "Neutral",
  "模型高度": "Model height",
  "下移距离": "Vertical offset",
  "随机动作": "Random motion",
  "恢复位置": "Reset position",
  "收起模型": "Collapse model",
  "打开角色设置": "Open companion settings",
  "角色设置": "Companion settings",
  "打开角色模型和设置": "Show model and settings",
  "开启朗读": "Enable speech",
  "关闭朗读": "Disable speech",
  "朗读已启用，点击关闭": "Speech enabled; click to disable",
  "朗读已关闭，点击开启": "Speech disabled; click to enable",
  "语音设置 · Fish Audio": "Speech settings · Fish Audio",
  "输入 Fish Audio API Key": "Enter your Fish Audio API key",
  "要使用的声音 ID": "Voice ID to use",
  "语音模型": "Speech model",
  "自动朗读新正文": "Read new responses aloud",
  "记住 API Key": "Remember API key",
  "Key 默认仅留在当前运行期间；勾选后以明文保存到本机配置文件。开启后，清理过的正文将逐句发送到 Fish Audio。": "The key stays in memory by default. Remembering it stores it as plaintext on this computer. When speech is enabled, cleaned response text is sent to Fish Audio one sentence at a time.",
  "保存配置": "Save settings",
  "试听": "Test voice",
  "停止朗读": "Stop speech",
  "清除 Key": "Clear key",
  "正在连接语音设置…": "Connecting to speech settings…",
  "已配置（留空保留当前 Key）": "Configured (leave blank to keep the current key)",
  "请填写有效的语音模型名称。": "Enter a valid speech model name.",
  "启用朗读前，请填写 API Key 和 reference_id。": "Enter an API key and reference_id before enabling speech.",
  "朗读中 · 自然表情": "Speaking · Neutral expression",
  "{expression} · 点击头部或身体会有回应": "{expression} · Click the head or body to interact",
  "加载失败：{error}": "Failed to load: {error}",
  "语音操作失败。": "Speech operation failed.",
  "语音服务未连接，请运行“Start.command”脚本。": "Speech service is disconnected. Run Start.command.",
  "已停止朗读。": "Speech stopped.",
  "语音服务没有响应，请重新启动角色。": "Speech service did not respond. Restart the companion.",
  "语音服务未连接，请重新启动角色。": "Speech service is disconnected. Restart the companion.",
  "语音服务已关闭。": "Speech service closed.",
  "请点“试听”或重新启用朗读，允许播放声音。": "Click Test voice or re-enable speech to allow audio playback.",
  "收到的音频无法播放，请检查模型配置。": "The received audio could not be played. Check the speech model settings.",
  "音频播放失败，请再点一次试听。": "Audio playback failed. Click Test voice to try again.",
  "正在连接 Fish Audio 设置…": "Connecting to Fish Audio settings…",
  "正在保存配置；已停止当前朗读。": "Saving settings; current speech has stopped.",
  "已停止当前朗读。": "Current speech stopped.",
  "自动朗读已关闭。": "Automatic speech is off.",
  "已启用，等待新正文。": "Enabled; waiting for new response text.",
  "已启用；点一下角色或试听，允许播放声音。": "Enabled; click the companion or Test voice to allow audio playback.",
  "配置已保存，自动朗读已关闭。": "Settings saved; automatic speech is off.",
  "请填写 API Key、reference_id 和语音模型。": "Enter an API key, reference_id, and speech model.",
  "正在朗读": "Speaking",
  "正在朗读 · 正在预取下一句": "Speaking · Fetching the next sentence",
  "正在朗读 · 已缓存 {count} 句": "Speaking · {count} sentence(s) cached",
  "正在合成一句语音…": "Synthesizing a sentence…",
  "等待下一句正文。": "Waiting for the next sentence.",
  "试听完成。": "Voice test complete.",
  "语音合成失败。": "Speech synthesis failed.",
  "声音播放已允许，等待新正文。": "Audio playback allowed; waiting for new response text.",
  "无法启用音频播放，请点试听重试。": "Could not enable audio playback. Click Test voice to retry.",
  "正在保存语音配置…": "Saving speech settings…",
  "请先在设置中保存 API Key、reference_id 和语音模型。": "Save an API key, reference_id, and speech model in settings first.",
  "点一下角色或试听，允许播放声音。": "Click the companion or Test voice to allow audio playback.",
  "朗读已关闭，请先启用朗读。": "Speech is off. Enable it first.",
  "请先保存 API Key、reference_id 和语音模型。": "Save an API key, reference_id, and speech model first.",
  "你好，这是语音测试。": "Hello, this is a voice test.",
  "reference_id 只能包含字母、数字、下划线和短横线。": "reference_id can only contain letters, numbers, underscores, and hyphens.",
  "API Key 格式无效。": "Invalid API key format.",
  "朗读已关闭。": "Speech is off.",
  "请先保存完整的 Fish Audio 配置。": "Save the complete Fish Audio settings first.",
  "没有可以朗读的文字。": "No text to read aloud.",
  "这句文字超过 8,000 字符，请缩短后再试。": "This sentence exceeds 8,000 characters. Shorten it and retry.",
  "API Key 无效或已过期。": "The API key is invalid or expired.",
  "Fish Audio 余额不足或当前模型不可用。": "Insufficient Fish Audio balance or the selected model is unavailable.",
  "此 Key 无权使用当前声音或模型。": "This key cannot access the selected voice or model.",
  "未找到声音或接口，请检查 reference_id。": "Voice or endpoint not found. Check reference_id.",
  "参数无效，请检查声音和模型名称。": "Invalid parameters. Check the voice and model names.",
  "Fish Audio 请求过于频繁，请稍后再试。": "Too many Fish Audio requests. Try again later.",
  "Fish Audio 暂时无法合成语音（HTTP {status}）。": "Fish Audio could not synthesize speech (HTTP {status}).",
  "这句音频过大，已停止接收。": "Audio too large; download stopped.",
  "Fish Audio 返回了空音频。": "Fish Audio returned empty audio.",
  "语音请求已取消或超时。": "Speech request cancelled or timed out.",
  "连接 Fish Audio 失败，请检查网络后重试。": "Could not connect to Fish Audio. Check the network and retry.",
  "未知的语音操作。": "Unknown speech operation.",
  "无法处理语音配置，请重试。": "Could not process speech settings. Try again."
};
  function resolveLanguage(saved, preferred = []) {
    if (saved === 'en' || saved === 'zh-CN') return saved;
    const languages = Array.isArray(preferred) ? preferred : [preferred];
    return /^zh(?:-|$)/i.test(languages[0] || '') ? 'zh-CN' : 'en';
  }
  function create(saved, preferred) {
    let language = resolveLanguage(saved, preferred);
    function t(source, values = {}) {
      // Host errors and progress arrive as plain text; preserve their language-neutral data.
      const cached = /^正在朗读 · 已缓存 (\d+) 句$/.exec(source);
      const http = /^Fish Audio 暂时无法合成语音（HTTP (\d+)）。$/.exec(source);
      if (cached) { source = '正在朗读 · 已缓存 {count} 句'; values = {count: cached[1]}; }
      if (http) { source = 'Fish Audio 暂时无法合成语音（HTTP {status}）。'; values = {status: http[1]}; }
      return (language === 'en' ? english[source] ?? source : source)
        .replace(/\{(\w+)\}/g, (token, key) => Object.hasOwn(values, key) ? String(values[key]) : token);
    }
    return {t, get language() { return language; }, setLanguage(value) {
      if (value !== 'en' && value !== 'zh-CN') return false;
      language = value; return true;
    }};
  }
  globalThis.Live2DI18n = {create, resolveLanguage};
})();

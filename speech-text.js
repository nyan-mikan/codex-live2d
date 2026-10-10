/* Markdown -> inert speech text. Shared by the renderer and local transport. */
(() => {
  const emoji=/(?:[#*0-9]\uFE0F?\u20E3)|[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0E\uFE0F\u200D\u{E0020}-\u{E007F}]/gu;
  function stripCitations(raw){
    // ChatGPT source pills are encoded in body data using these citation tokens.
    // Remove the whole token before Markdown cleanup can expose its internal IDs.
    let text=raw.replace(/:chatgpt-content-reference\b(?:\{[^}]*\}?|$)/g,'')
      .replace(/\uE200(?:cite|filecite)\b[\s\S]*?(?:\uE201|$)/g,'')
      .replace(/【(?:turn[\w-]+|\d+)[†][^】]*】/g,'');
    // A streamed token can arrive as just its opening character or a partial name.
    const directive=text.lastIndexOf(':');
    if(directive>=0){
      const suffix=text.slice(directive);
      if(suffix.length>1&&':chatgpt-content-reference'.startsWith(suffix))text=text.slice(0,directive);
    }
    const open=text.lastIndexOf('\uE200');
    if(open>=0&&!text.slice(open).includes('\uE201')){
      const kind=text.slice(open+1).split('\uE202',1)[0];
      if(['cite','filecite'].some(name=>name.startsWith(kind)))text=text.slice(0,open);
    }
    return text;
  }
  function decodeEntities(text){
    const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',copy:'',reg:'',hellip:'…',ndash:'–',mdash:'—'};
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,k)=>{
      if(k[0]!=='#')return named[k.toLowerCase()]??m;
      const n=k[1].toLowerCase()==='x'?parseInt(k.slice(2),16):parseInt(k.slice(1),10);
      return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
    });
  }
  function tokensText(tokens){
    return tokens.map(t=>{
      if(t.type==='space'||t.type==='hr'||t.type==='br')return '\n';
      if(t.type==='html')return t.text.replace(/<!--[\s\S]*?-->/g,'').replace(/<\/?(?:p|div|br|li|h[1-6])\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'');
      if(t.type==='image')return t.text||'';
      if(t.type==='list')return t.items.map(i=>tokensText(i.tokens)).join('\n')+'\n';
      if(t.type==='table')return [t.header,...t.rows].map(row=>row.map(c=>tokensText(c.tokens)).join('，')).join('\n')+'\n';
      const text=t.tokens?tokensText(t.tokens):t.text||'';
      return text+(['heading','paragraph','blockquote','code'].includes(t.type)||t.type==='text'&&t.tokens?'\n':'');
    }).join('');
  }
  function stripLaughter(text){
    // Keep URL spans intact, including w's in paths, queries and fragments.
    // Only standalone lowercase laughter runs are removed; ordinary words and
    // the uppercase WWW acronym remain readable.
    const urls=/(?:\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.)([^\s<>"'`，。！？；：、（）【】「」]+)|\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d+)?(?:[/?#][^\s<>"'`，。！？；：、（）【】「」]*)?/gi;
    const laughter=/(?<![A-Za-z0-9_])(?:w{3,}|ｗ{3,})(?![A-Za-z0-9_])/g;
    let result='',start=0;
    for(const match of text.matchAll(urls)){
      result+=text.slice(start,match.index).replace(laughter,'')+match[0];
      start=match.index+match[0].length;
    }
    return result+text.slice(start).replace(laughter,'');
  }
  function cleanMarkdown(raw){
    if(typeof raw!=='string')return '';
    const source=stripCitations(raw).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'');
    let text=tokensText(globalThis.marked.lexer(source,{gfm:true}));
    // Strip partial delimiters left by streamed/incomplete syntax, without rendering any HTML.
    text=decodeEntities(text).replace(/!?\[([^\]\n]+)\](?:\([^\n)]*\)|\[[^\]\n]*\])/g,'$1')
      .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm,'').replace(/<[^>]*>/g,'')
      .replace(/^\s*(?:#{1,6}\s+|>+\s*|[-+*]\s+|\d+[.)]\s+|\[[ xX]\]\s*)/gm,'')
      .replace(/[`*_~\[\]]/g,'').replace(/\|/g,'，').replace(/\$\$?|\\\(|\\\)|\\\[|\\\]/g,'')
      .replace(emoji,'').replace(/[\u200B-\u200D\uFEFF\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
    text=stripLaughter(text).replace(/[ \t]+/g,' ').replace(/ +([，。！？；：])/g,'$1').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
    return text;
  }
  function stablePrefix(raw,completed){
    raw=stripCitations(raw);
    if(completed)return raw;
    // Do not speak a partial link destination, code span/fence, or HTML tag. Future tokens could change it.
    let fence=null,inline=null,bracket=[],destination=0,tag=-1,cut=raw.length;
    for(let i=0;i<raw.length;i++){
      if(raw[i]==='\\'){i++;continue;}
      const lineStart=i===0||raw[i-1]==='\n';
      if(lineStart){const m=raw.slice(i).match(/^ {0,3}(`{3,}|~{3,})/);if(m){
        if(!fence)fence={char:m[1][0],length:m[1].length,start:i};
        else if(m[1][0]===fence.char&&m[1].length>=fence.length)fence=null;
        i+=m[0].length-1;continue;
      }}
      if(fence)continue;
      if(raw[i]==='`'){const m=raw.slice(i).match(/^`+/)[0];if(!inline)inline={length:m.length,start:i};else if(inline.length===m.length)inline=null;i+=m.length-1;continue;}
      if(inline)continue;
      if(raw[i]==='[')bracket.push(i);
      if(raw[i]===']'&&bracket.length){const start=bracket.pop();if(raw[i+1]==='('){destination=1;bracket.push(start);i++;continue;}if(i===raw.length-1)cut=Math.min(cut,start);}
      else if(destination&&raw[i]==='(')destination++;
      else if(destination&&raw[i]===')'&&--destination===0)bracket.pop();
      if(raw[i]==='<'&&/[a-zA-Z/!]/.test(raw[i+1]||''))tag=i;
      if(raw[i]==='>')tag=-1;
    }
    if(fence)cut=Math.min(cut,fence.start);
    if(inline)cut=Math.min(cut,inline.start);
    if(bracket.length)cut=Math.min(cut,bracket[0]);
    if(tag>=0)cut=Math.min(cut,tag);
    return raw.slice(0,cut);
  }
  function sentences(text,completed=false){
    const out=[];let start=0;
    const push=end=>{const s=text.slice(start,end).trim();start=end;if(/[\p{L}\p{N}]/u.test(s))out.push(s);};
    for(let i=0;i<text.length;i++){
      const c=text[i];let end=/[。！？!?\n]/u.test(c);
      if(c==='.'){
        const word=text.slice(start,i+1).match(/[^\s]+$/)?.[0]||'';
        const abbreviation=/(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)|\b(?:[A-Za-z]\.)+[A-Za-z])\.$/i.test(word);
        end=!abbreviation&&!(/\d/.test(text[i-1]||'')&&/\d/.test(text[i+1]||''))&&!/https?:\/\/|www\.|@/.test(word)&&((i+1<text.length&&/[\s”’"')\]]/.test(text[i+1]))||completed&&i===text.length-1);
      }
      if(!end)continue;
      let j=i+1;while(j<text.length&&/[。！？!?.”’"')\]]/.test(text[j]))j++;
      // A newline closes a phrase; a final English period waits for lookahead during streaming.
      push(j);i=j-1;
    }
    if(completed)push(text.length);
    return out;
  }
  class SentenceTracker {
    constructor(){this.reset();}
    reset(){this.key=null;this.count=0;this.ignored=false;this.baseline='';}
    skip(message){this.key=message?message.conversationId+':'+message.id:null;this.count=0;this.baseline=message?.text||'';this.ignored=message?.completed===true;}
    feed(message){
      const key=message.conversationId+':'+message.id;
      if(key!==this.key){this.reset();this.key=key;if(message.initial){this.skip(message);return [];}}
      if(this.ignored)return [];
      let raw=message.text;
      if(this.baseline){if(!raw.startsWith(this.baseline))return [];raw=raw.slice(this.baseline.length);}
      const text=cleanMarkdown(stablePrefix(raw,message.completed));
      const list=sentences(text,message.completed),fresh=list.slice(this.count);
      this.count=Math.max(this.count,list.length);return fresh;
    }
  }
  globalThis.CompanionSpeechText={stripCitations,stripLaughter,cleanMarkdown,stablePrefix,sentences,SentenceTracker};
})();

/* Browser-local phrase frequency scanner. Does not change the loaded JSON. */
(function(global){
function frequencyTokens(text){
 const re=/[\p{L}\p{M}\p{N}]+(?:['’_-][\p{L}\p{M}\p{N}]+)*/gu;
 const out=[];let match,lastEnd=0,segment=0;
 while((match=re.exec(text))!==null){
  if(/[.!?;。！？\n\r]/u.test(text.slice(lastEnd,match.index)))segment++;
  out.push({word:match[0].normalize("NFKC").toLocaleLowerCase("en"),start:match.index,end:re.lastIndex,segment});
  lastEnd=re.lastIndex;
 }
 return out;
}
function analyzePhraseFrequency(root,fieldNames,options={}){
 const chosen=new Set(fieldNames.map(x=>String(x).toLowerCase()));
 const minWords=Math.max(2,Math.min(8,Number(options.minWords)||3));
 const maxWords=Math.max(minWords,Math.min(8,Number(options.maxWords)||6));
 const minEntries=Math.max(2,Number(options.minEntries)||2);
 const includeInternal=!!options.includeInternal;
 const maxTokens=120000,maxCandidates=3500;
 const sources=[];let totalTokens=0,truncated=false;
 function collect(node,path=[],matched=false){
  if(typeof node==="string"){
   if(!matched)return;
   let tokens=frequencyTokens(node);
   if(totalTokens>=maxTokens){truncated=true;return;}
   if(tokens.length>maxTokens-totalTokens){tokens=tokens.slice(0,maxTokens-totalTokens);truncated=true;}
   if(tokens.length){totalTokens+=tokens.length;const entryPath=typeof path[path.length-1]==="number"?path:path.slice(0,-1);
    sources.push({text:node,path:[...path],pathId:JSON.stringify(path),entryPath,entryId:JSON.stringify(entryPath),tokens});}
   return;
  }
  if(node&&typeof node==="object")Object.entries(node).forEach(([k,v])=>{
   const part=Array.isArray(node)?Number(k):k;
   collect(v,[...path,part],matched||(typeof part==="string"&&chosen.has(part.toLowerCase())));
  });
 }
 collect(root);
 const docIds=new Set(sources.map(x=>x.entryId));
 function eachPhrase(callback){
  for(const src of sources){
   const t=src.tokens;
   for(let i=0;i<t.length;i++){
    let phrase="";
    for(let n=1;n<=maxWords&&i+n<=t.length;n++){
     const last=t[i+n-1];
     if(last.segment!==t[i].segment)break;
     phrase+=(n===1?"":" ")+last.word;
     if(n>=minWords)callback(phrase,n,src,t[i].start,last.end);
    }
   }
  }
 }
 const counts=new Map();
 eachPhrase((phrase,n,src)=>{
  let x=counts.get(phrase);
  if(!x){x={phrase,words:n,count:0,docs:new Set()};counts.set(phrase,x);}
  x.count++;x.docs.add(src.entryId);
 });
 let candidates=[...counts.values()].filter(x=>x.count>=2&&(x.docs.size>=minEntries||(includeInternal&&x.docs.size===1)));
 const allCandidates=candidates.length;
 candidates.sort((a,b)=>b.docs.size-a.docs.size||b.count-a.count||b.words-a.words||a.phrase.localeCompare(b.phrase));
 if(candidates.length>maxCandidates)candidates=candidates.slice(0,maxCandidates);
 const lookup=new Map(candidates.map(x=>{x.entries=x.docs.size;x.occurrences=[];delete x.docs;return [x.phrase,x];}));
 eachPhrase((phrase,n,src,start,end)=>{const item=lookup.get(phrase);if(item)item.occurrences.push({path:src.path,pathId:src.pathId,entryPath:src.entryPath,start,end});});
 const groups=new Map(),results=[];
 for(const current of [...candidates].sort((a,b)=>b.words-a.words||b.entries-a.entries||b.count-a.count)){
  const signature=current.count+"/"+current.entries;
  const prior=groups.get(signature)||[];
  const redundant=prior.some(long=>{
   if(long.words<=current.words||!(" "+long.phrase+" ").includes(" "+current.phrase+" "))return false;
   return current.occurrences.every(a=>long.occurrences.some(b=>a.pathId===b.pathId&&b.start<=a.start&&b.end>=a.end));
  });
  if(!redundant){prior.push(current);groups.set(signature,prior);results.push(current);}
 }
 results.sort((a,b)=>b.entries-a.entries||b.count-a.count||b.words-a.words||a.phrase.localeCompare(b.phrase));
 return {items:results,fields:sources.length,entries:docIds.size,tokens:totalTokens,truncated,totalCandidates:allCandidates,limited:allCandidates>maxCandidates};
}
global.PhraseFrequency={analyze:analyzePhraseFrequency};
})(window);

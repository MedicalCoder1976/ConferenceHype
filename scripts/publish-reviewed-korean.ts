import { loadEnvConfig } from '@next/env';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getYoutubeAccessToken, uploadVideoToYoutube } from '../lib/youtube/uploadBroadcastVideo';
loadEnvConfig(process.cwd());
const base=path.resolve('.tmp/mandarin-289afedf');
const statePath=path.join(base,'youtube-result.json');
async function main(){
 const m=JSON.parse(await readFile(path.join(base,'release.json'),'utf8'));
 m.video_path=path.join(base,'wclc-china-289afedf-zh.mp4');
 m.subtitle_path=path.join(base,'wclc-china-289afedf-zh.srt');
 if(m.quality.narration_pages.length<14 || m.quality.narration_pages.some((p:any)=>p.mean_db < -40)) throw Error('Audio acceptance failed');
 if(m.broadcast_id!=='289afedf-e4f8-4751-87fa-56df357af78d'||m.source_video_id!=='7SBNI5aUdhM') throw Error('Wrong source'); const qa=JSON.parse(await readFile(path.join(base,'qa.json'),'utf8')); if(!qa.all_14_source_sections_present||qa.silence_over_2sec.length) throw Error('QA failed'); const token=await getYoutubeAccessToken();
 async function api(url:string, init:any={}) {const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,...init.headers}});if(!r.ok)throw Error(`YouTube ${r.status}: ${await r.text()}`);return r.json();}
 let state:any={};try{state=JSON.parse(await readFile(statePath,'utf8'));}catch{}
 if(!state.id){
  const dup=await api('https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=10&q='+encodeURIComponent(m.title));
  const match=dup.items?.find((x:any)=>x.snippet.title===m.title);
  if(match) state.id=match.id.videoId;
 }
 if(!state.id){
  const uploaded=await uploadVideoToYoutube({filePath:m.video_path,accessToken:token,title:m.title,description:m.description,tags:['WCLC 2026','WCLC Seoul','中国研发药物','小细胞肺癌','普通话','IASLC','ConferenceHype'],categoryId:'28',privacyStatus:'private'});
  state={id:uploaded.id,status:'private-uploaded',source_video_id:m.source_video_id};
  await writeFile(statePath,JSON.stringify(state,null,2));
 }
 console.log('Uploaded privately:',state.id);
 let item:any;
 for(let n=0;n<50;n++){
  const r=await api(`https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails,snippet,contentDetails&id=${state.id}`);item=r.items?.[0];
  if(item?.status?.uploadStatus==='processed')break;
  if(['failed','rejected','deleted'].includes(item?.status?.uploadStatus))throw Error('YouTube processing failed');
  if(n===49)throw Error('YouTube processing timed out; video remains private');
  console.log('Waiting for YouTube processing');await new Promise(r=>setTimeout(r,15000));
 }
 await api('https://www.googleapis.com/youtube/v3/videos?part=snippet',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:state.id,snippet:{title:m.title,description:m.description,categoryId:'28',tags:item.snippet.tags,defaultLanguage:'zh-Hans',defaultAudioLanguage:'zh-CN'}})});
 const thumbnail=await readFile(path.join(base,'thumbnail.png'));
 await api(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${state.id}`,{method:'POST',headers:{'Content-Type':'image/png'},body:thumbnail});
 if(!state.caption_attempted){
  const boundary='mandarin-'+Date.now();const srt=await readFile(m.subtitle_path);
  const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({snippet:{videoId:state.id,language:'zh-Hans',name:'简体中文',isDraft:false}})}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),srt,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  try{const c:any=await api('https://www.googleapis.com/upload/youtube/v3/captions?part=snippet&uploadType=multipart',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});state.caption_id=c.id;}
  catch(e){if(!/403.*(?:scope|insufficient)|409/s.test(String(e)))throw e;console.log('Separate caption track unavailable; full Mandarin text is embedded in the video.');}
  state.caption_attempted=true;await writeFile(statePath,JSON.stringify(state,null,2));
 }
 if(process.argv.includes('--publish')){
  await api('https://www.googleapis.com/youtube/v3/videos?part=status',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:state.id,status:{privacyStatus:'public',selfDeclaredMadeForKids:false,embeddable:true}})});
  const verified=await api(`https://www.googleapis.com/youtube/v3/videos?part=status,snippet,contentDetails&id=${state.id}`);
  const v=verified.items?.[0];if(v?.status.privacyStatus!=='public'||v?.status.uploadStatus!=='processed'||v?.snippet.defaultAudioLanguage!=='zh-CN')throw Error('Public Mandarin verification failed');
  state={...state,status:'verified',youtube_url:`https://www.youtube.com/watch?v=${state.id}`,youtube:v};
  await writeFile(statePath,JSON.stringify(state,null,2));console.log(JSON.stringify({status:state.status,url:state.youtube_url,title:v.snippet.title,duration:v.contentDetails.duration}));
 } else console.log('Private video prepared. Publication requires --publish.');
}
main().catch(e=>{console.error(e);process.exitCode=1});

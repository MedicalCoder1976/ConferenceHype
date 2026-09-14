import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getYoutubeAccessToken, uploadVideoToYoutube } from '../lib/youtube/uploadBroadcastVideo';

const code=process.argv[2];
if(!['ko','zh','ja'].includes(code)) throw Error('Invalid edition');
const base=path.resolve('edition');
const statePath=path.join(base,'youtube-result.json');
const sleep=()=>new Promise(r=>setTimeout(r,15000));
async function main(){
 const m=JSON.parse(await readFile(path.join(base,'release.json'),'utf8'));
 const qa=JSON.parse(await readFile(path.join(base,'qa.json'),'utf8'));
 if(m.edition_id!==`asia-wclc-20260914-${code}` || m.segments.length!==14 || !qa.all_14_source_sections_present || !qa.subtitles_match_reviewed_translation || !qa.audio_stream_present || qa.silence_over_2sec.length || qa.minimum_voice_mean_db < -40) throw Error('Edition or QA acceptance failed');
 const marker=`Edition: ${m.edition_id}`;
 const description=m.description+'\n\n'+marker;
 if(Buffer.byteLength(description,'utf8')>5000)throw Error('Description too long');
 const token=await getYoutubeAccessToken();
 async function api(url:string, init:any={}) {
  const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,...init.headers},signal:AbortSignal.timeout(120000)});
  if(!r.ok)throw Error(`YouTube ${r.status}: ${await r.text()}`);
  return r.json();
 }
 let state:any={};
 try{state=JSON.parse(await readFile(statePath,'utf8'));}catch{}
 // Search the authenticated channel's upload playlist, including private uploads,
 // before every upload. This makes interrupted workflow retries recover the same video.
 if(!state.id){
  const channel=await api('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true');
  const playlist=channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if(!playlist)throw Error('Could not identify authenticated upload channel');
  let page='';
  do {
   const items=await api(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlist}&pageToken=${page}`);
   const match=items.items?.find((x:any)=>x.snippet.description.includes(marker));
   if(match){state.id=match.contentDetails.videoId;break;}
   page=items.nextPageToken??'';
  }while(page);
 }
 if(!state.id){
  if(process.argv.includes('--verify') || process.argv.includes('--inspect'))throw Error('No existing edition found; read-only checks never upload');
  const uploaded=await uploadVideoToYoutube({filePath:path.join(base,`asia-wclc-${code}.mp4`),accessToken:token,title:m.title,description,tags:['WCLC 2026','Seoul','Lung cancer','Yuhan','Akeso','Hansoh','Daiichi Sankyo',m.language_native,'ConferenceHype'],categoryId:'28',privacyStatus:'private'});
  state={id:uploaded.id,status:'private-uploaded',edition_id:m.edition_id};
 }
 await writeFile(statePath,JSON.stringify(state,null,2));
 console.log('Recovered or uploaded video:',state.id);
 if(process.argv.includes('--inspect')){
  const result=await api(`https://www.googleapis.com/youtube/v3/videos?part=status,snippet,contentDetails&id=${state.id}`);
  state={...state,status:'inspected',youtube:result.items?.[0]};
  await writeFile(statePath,JSON.stringify(state,null,2));
  console.log(JSON.stringify(state));return;
 }
 let item:any;
 for(let n=0;n<60;n++){
  const result=await api(`https://www.googleapis.com/youtube/v3/videos?part=status,snippet,contentDetails&id=${state.id}`);
  item=result.items?.[0];
  if(item?.status.uploadStatus==='processed')break;
  if(['failed','rejected','deleted'].includes(item?.status.uploadStatus)||n===59)throw Error('YouTube processing did not complete');
  await sleep();
 }
 if(!process.argv.includes('--verify')){
  await api('https://www.googleapis.com/youtube/v3/videos?part=snippet',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:state.id,snippet:{title:m.title,description,categoryId:'28',tags:item.snippet.tags,defaultLanguage:m.language,defaultAudioLanguage:m.audio_language}})});
  await api(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${state.id}`,{method:'POST',headers:{'Content-Type':'image/png'},body:await readFile(path.join(base,'thumbnail.png'))});
  state.thumbnail_uploaded=true;
  await writeFile(statePath,JSON.stringify(state,null,2));
  if(process.argv.includes('--publish')){
   await api('https://www.googleapis.com/youtube/v3/videos?part=status',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:state.id,status:{privacyStatus:'public',selfDeclaredMadeForKids:false,embeddable:true,containsSyntheticMedia:true}})});
  }
 }
 for(let n=0;n<30;n++){
  const result=await api(`https://www.googleapis.com/youtube/v3/videos?part=status,snippet,contentDetails&id=${state.id}`);
  const v=result.items?.[0];
  state={...state,youtube:v};
  await writeFile(statePath,JSON.stringify(state,null,2));
  console.log(JSON.stringify({id:state.id,privacy:v?.status.privacyStatus,upload:v?.status.uploadStatus,language:v?.snippet.defaultLanguage,audio:v?.snippet.defaultAudioLanguage}));
  if(v?.status.privacyStatus==='public' && v?.status.uploadStatus==='processed' && v?.snippet.title===m.title && v?.snippet.defaultLanguage===m.language && v?.snippet.defaultAudioLanguage===m.audio_language){
   const url=`https://www.youtube.com/watch?v=${state.id}`;
   const response=await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent(url));
   if(response.ok){
    const embed=await response.json();
    if(embed.title!==m.title)throw Error('Public title mismatch');
    state={...state,status:'verified_public',youtube_url:url,youtube:v,oembed:embed};
    await writeFile(statePath,JSON.stringify(state,null,2));
    console.log(JSON.stringify({status:state.status,url,title:m.title,duration:v.contentDetails.duration,language:v.snippet.defaultAudioLanguage}));return;
   }
  }
  if(n===29)throw Error('Public verification timed out; reuse the saved video ID');
  await sleep();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});

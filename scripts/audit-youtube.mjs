import fs from 'node:fs';
import crypto from 'node:crypto';
const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.YOUTUBE_OAUTH_CLIENT_ID,client_secret:process.env.YOUTUBE_OAUTH_CLIENT_SECRET,refresh_token:process.env.YOUTUBE_OAUTH_REFRESH_TOKEN,grant_type:'refresh_token'})});
if(!tokenResponse.ok)throw Error('OAuth refresh failed: '+tokenResponse.status);
const {access_token}=await tokenResponse.json();
async function get(url){const r=await fetch(url,{headers:{Authorization:`Bearer ${access_token}`},signal:AbortSignal.timeout(60000)});return {http:r.status,data:await r.json()};}
const channel=await get('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails,brandingSettings&mine=true');
const id=channel.data.items?.[0]?.id;
if(id!=='UCp9ihETXF_55sQIB-vDLvcA')throw Error('Unexpected channel');
const playlist=channel.data.items[0].contentDetails.relatedPlaylists.uploads;
const uploads=[];let page='';
do{const r=await get(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlist}&pageToken=${page}`);if(r.http!==200)throw Error('Catalog failed '+r.http);uploads.push(...r.data.items);page=r.data.nextPageToken??'';}while(page);
const videos=[];
for(let i=0;i<uploads.length;i+=50){const ids=uploads.slice(i,i+50).map(x=>x.contentDetails.videoId).join(',');const r=await get(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails,status,liveStreamingDetails&id=${ids}`);if(r.http!==200)throw Error('Video details failed '+r.http);videos.push(...r.data.items);}
const startDate='2026-08-17',endDate='2026-09-13';
const base=`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=${startDate}&endDate=${endDate}`;
const metrics='views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,subscribersGained,subscribersLost';
const analytics={summary:await get(base+'&metrics='+metrics)};
if(analytics.summary.http===200){
 analytics.videos=await get(base+'&metrics='+metrics+'&dimensions=video&sort=-views&maxResults=200');
 analytics.traffic=await get(base+'&metrics=views,estimatedMinutesWatched&dimensions=insightTrafficSourceType');
 analytics.countries=await get(base+'&metrics=views,estimatedMinutesWatched,subscribersGained&dimensions=country&sort=-views&maxResults=30');
 const top=videos.filter(v=>v.status.privacyStatus==='public').sort((a,b)=>Number(b.statistics.viewCount)-Number(a.statistics.viewCount)).slice(0,3);
 analytics.retention=[];
 for(const v of top)analytics.retention.push({videoId:v.id,report:await get(base+'&metrics=audienceWatchRatio,relativeRetentionPerformance&dimensions=elapsedVideoTimeRatio&filters=video%3D%3D'+v.id)});
}
const result={retrievedAt:new Date().toISOString(),channel,uploads,videos,analytics,period:{startDate,endDate}};
const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
const payload=Buffer.concat([cipher.update(JSON.stringify(result),'utf8'),cipher.final()]);
const wrapped=crypto.publicEncrypt({key:fs.readFileSync('audit-public.pem'),oaepHash:'sha256'},key);
fs.writeFileSync('audit.encrypted.json',JSON.stringify({key:wrapped.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:payload.toString('base64')}));
console.log('Read-only channel audit complete. Result encrypted for local review.');

#!/usr/bin/env python3
"""Render reviewed Korean/Japanese editions of the specified verified Story."""
import argparse, hashlib, json, os, re, subprocess, sys, time, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

def run(args, **kw):
    return subprocess.run(args, check=True, **kw)
def duration(p):
    return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",str(p)],text=True))
def stamp(s):
    ms=round(s*1000); h,ms=divmod(ms,3600000); m,ms=divmod(ms,60000); s,ms=divmod(ms,1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"
def api(path):
    key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req=urllib.request.Request(os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")+"/rest/v1/"+path,headers={"apikey":key,"Authorization":"Bearer "+key})
    with urllib.request.urlopen(req) as r: return json.load(r)
def chunks(text, limit=150):
    sentences=re.split(r"(?<=[。!?])|(?<=\.)\s+",text)
    out=[]; current=""
    for sentence in sentences:
        sentence=sentence.strip()
        if not sentence: continue
        if current and len(current)+len(sentence)>limit:
            out.append(current); current=""
        current+=(" " if current else "")+sentence
    if current: out.append(current)
    return out
def wrap(draw,text,font,width):
    lines=[]; line=""
    for ch in text:
        if draw.textlength(line+ch,font=font)>width:
            lines.append(line.rstrip()); line=ch.lstrip()
        else: line+=ch
    if line: lines.append(line)
    return lines
def frame(target,lang,title,body,page,total,thumbnail=False):
    image=Image.new("RGB",(1280,720),"#081727"); d=ImageDraw.Draw(image)
    font_path="/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
    index=1 if lang=="ko" else 0
    font=lambda size: ImageFont.truetype(font_path,size,index=index)
    d.rectangle((0,0,1280,12),fill="#ed3949")
    d.text((64,38),"ConferenceHype",font=font(27),fill="#ffffff")
    d.rounded_rectangle((960,36,1216,84),radius=12,fill="#a31b32")
    d.text((981,43),"BREAKING",font=font(25),fill="#ffffff")
    d.text((64,110),"한국어" if lang=="ko" else "日本語",font=font(22),fill="#80d9e6")
    if thumbnail:
        y=215
        for text in body:
            f=font(52)
            while d.textlength(text,font=f)>1150: f=font(f.size-1)
            d.text((64,y),text,font=f,fill="#ffffff"); y+=104
    else:
        f=font(37); titles=wrap(d,title,f,1150)
        for j,line in enumerate(titles): d.text((64,165+j*50),line,font=f,fill="#80d9e6")
        top=180+len(titles)*50
        f=font(34)
        lines=wrap(d,body,f,1150)
        while top+len(lines)*(f.size+18)>615:
            f=font(f.size-1); lines=wrap(d,body,f,1150)
            if f.size<25: raise RuntimeError("Page is too dense")
        for j,line in enumerate(lines): d.text((64,top+j*(f.size+18)),line,font=f,fill="#ffffff")
    d.line((64,644,1216,644),fill="#294052",width=2)
    d.text((64,664),"2026-09-21  |  Novo Nordisk / CagriSema",font=font(19),fill="#9cadc1")
    if not thumbnail: d.text((1120,662),f"{page}/{total}",font=font(20),fill="#9cadc1")
    image.save(target)
def main():
    p=argparse.ArgumentParser(); p.add_argument("--language",choices=["ko","ja"],required=True); a=p.parse_args()
    package=json.loads(Path("data/localized-L4TufVGhKOI.json").read_text())
    edition=package["languages"][a.language]
    broadcast=api("meeting_watch_broadcasts?id=eq."+package["broadcast_id"]+"&select=*")[0]
    assert broadcast["status"]=="verified" and broadcast["youtube_video_id"]==package["source_video_id"]
    assert broadcast["card_ids"]==[s["id"] for s in edition["segments"]]
    cards=api("segments?id=in.("+",".join(broadcast["card_ids"])+")&select=id,script")
    by_id={x["id"]:x for x in cards}
    for s in edition["segments"]:
        assert s["source_script"]==by_id[s["id"]]["script"],"Source changed since review"
        assert not re.search(r"https?://|\x60\x60\x60",s["script_localized"])
    out=Path("localized-output"); out.mkdir(exist_ok=True)
    pages=[]
    for s in edition["segments"]:
        for text in chunks(s["script_localized"]): pages.append((s["id"],s["title_localized"],text))
    cursor=0; audit=[]; captions=[]; parts=[]
    voice="ko-KR-SunHiNeural" if a.language=="ko" else "ja-JP-NanamiNeural"
    for n,(sid,title,text) in enumerate(pages):
        stem=out/f"page-{n:02}"
        audio=stem.with_suffix(".mp3"); picture=stem.with_suffix(".png"); video=stem.with_suffix(".mp4")
        for attempt in range(4):
            try:
                run([sys.executable,"-m","edge_tts","--voice",voice,"--text",text,"--write-media",str(audio)])
                seconds=duration(audio)
                if seconds<1: raise RuntimeError("Empty voice clip")
                break
            except Exception:
                if attempt==3: raise
                time.sleep(5*(attempt+1))
        frame(picture,a.language,title,text,n+1,len(pages))
        run(["ffmpeg","-v","error","-y","-loop","1","-framerate","25","-i",str(picture),"-i",str(audio),"-t",str(seconds),"-c:v","libx264","-preset","fast","-crf","21","-pix_fmt","yuv420p","-c:a","aac","-b:a","160k","-ar","48000","-ac","1",str(video)])
        volume=run(["ffmpeg","-hide_banner","-i",str(audio),"-af","volumedetect","-f","null","-"],capture_output=True,text=True).stderr
        mean=float(re.search(r"mean_volume: ([-\d.]+)",volume).group(1))
        if mean < -35: raise RuntimeError("Narration too quiet")
        short=[text[i:i+34] for i in range(0,len(text),34)]
        for j,part in enumerate(short):
            captions.extend([str(len(captions)//4+1),f"{stamp(cursor+seconds*j/len(short))} --> {stamp(cursor+seconds*(j+1)/len(short))}",part,""])
        audit.append({"page":n+1,"segment_id":sid,"text":text,"duration":seconds,"mean_volume_db":mean})
        parts.append(video.name);cursor+=seconds
    if cursor>900: raise RuntimeError("Edition exceeds 15 minutes")
    prefix=package["broadcast_id"]+"-"+a.language
    concat=out/"concat.txt"; concat.write_text("\n".join("file '"+v+"'" for v in parts))
    final=out/(prefix+".mp4")
    run(["ffmpeg","-v","error","-y","-f","concat","-safe","0","-i",str(concat),"-c","copy","-movflags","+faststart",str(final)])
    srt=out/(prefix+".srt"); srt.write_text("\n".join(captions),encoding="utf-8")
    thumb=out/(prefix+"-thumbnail.png"); frame(thumb,a.language,"",edition["thumbnail"],0,0,True)
    run(["ffmpeg","-v","error","-y","-i",str(final),"-vn","-c:a","libmp3lame","-b:a","96k",str(out/(prefix+"-audio.mp3"))])
    metadata={"broadcast_id":package["broadcast_id"],"source_video_id":package["source_video_id"],"language":a.language,"language_name":"Korean" if a.language=="ko" else "Japanese","language_native":"한국어" if a.language=="ko" else "日本語","title":edition["title"],"description":edition["description"]+"\n\nOriginal English: https://www.youtube.com/watch?v="+package["source_video_id"]+"\nSource: "+package["source_url"]+"\n\nConferenceHype","video_path":str(final),"subtitle_path":str(srt),"thumbnail_path":str(thumb),"segments":edition["segments"],"duration_seconds":duration(final),"video_sha256":hashlib.sha256(final.read_bytes()).hexdigest()}
    (out/(prefix+".json")).write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding="utf-8")
    (out/(prefix+"-audit.json")).write_text(json.dumps({"pages":audit,"source_sections":len(edition["segments"]),"duration_seconds":cursor,"voice":voice},ensure_ascii=False,indent=2),encoding="utf-8")
    for v in parts: (out/v).unlink()
    for v in out.glob("page-*.mp3"): v.unlink()
    print(json.dumps({"language":a.language,"pages":len(pages),"duration":cursor,"status":"review-ready"}))
if __name__=="__main__": main()

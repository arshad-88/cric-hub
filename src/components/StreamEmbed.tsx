import { Button } from "@/components/ui/button";
import { isTwitchUrl, parseYouTubeId, twitchChannel } from "@/lib/vpl";
import { Clapperboard, Eye, EyeOff, Radio } from "lucide-react";
import { useEffect, useState } from "react";

/** YouTube or Twitch live embed. Toggleable so fans can hide it. */
export function StreamEmbed({ url }: { url: string | null }) {
  const [hidden, setHidden] = useState(false);
  const [host, setHost] = useState("");
  useEffect(() => {
    setHost(window.location.hostname);
  }, []);

  const youTubeId = url ? parseYouTubeId(url) : null;
  const twitch = url ? twitchChannel(url) : null;

  if (hidden) {
    return (
      <div className="flex aspect-video items-center justify-center border border-foreground bg-black">
        <Button
          type="button"
          variant="outline"
          className="gap-2 rounded-none border-white bg-black text-white hover:bg-white hover:text-black"
          onClick={() => setHidden(false)}
        >
          <Eye className="size-4" />
          SHOW STREAM
        </Button>
      </div>
    );
  }

  if (youTubeId) {
    return (
      <div className="relative border border-foreground bg-black">
        <iframe
          className="aspect-video w-full"
          src={`https://www.youtube.com/embed/${youTubeId}?autoplay=1&rel=0&color=white`}
          title="Live stream"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="absolute right-2 top-2 inline-flex items-center gap-1.5 bg-black/80 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur hover:bg-black"
        >
          <EyeOff className="size-3" /> Hide
        </button>
      </div>
    );
  }

  if (twitch && host) {
    return (
      <div className="relative border border-foreground bg-black">
        <iframe
          className="aspect-video w-full"
          src={`https://player.twitch.tv/?channel=${twitch}&parent=${host}&muted=true`}
          title="Twitch live stream"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
        />
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="absolute right-2 top-2 inline-flex items-center gap-1.5 bg-black/80 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur hover:bg-black"
        >
          <EyeOff className="size-3" /> Hide
        </button>
      </div>
    );
  }

  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-3 border border-foreground bg-muted p-6 text-center">
      <Clapperboard className="size-8 text-foreground/40" />
      <p className="text-xs font-bold uppercase tracking-widest text-foreground/60">
        No stream configured for this match
      </p>
      <p className="flex items-center gap-1.5 text-[11px] text-foreground/50">
        <Radio className="size-3" />
        The scorer can paste a YouTube / Twitch link any time
      </p>
    </div>
  );
}

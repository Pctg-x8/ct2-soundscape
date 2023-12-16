import { type ChangeEvent, useEffect, useRef, useState } from "react";

export default function Player({ source, title }: { readonly source?: string; readonly title: string }) {
    const nativePlayerRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setPlaying] = useState(false);
    const [volume, setVolume] = useState(1);
    const [totalLength, setTotalLength] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    useEffect(() => {
        const subscriptionCanceller = new AbortController();

        nativePlayerRef.current?.addEventListener("play", () => setPlaying(true), {
            signal: subscriptionCanceller.signal,
        });
        nativePlayerRef.current?.addEventListener("pause", () => setPlaying(false), {
            signal: subscriptionCanceller.signal,
        });

        nativePlayerRef.current?.addEventListener(
            "volumechange",
            (e) => setVolume((e.currentTarget as HTMLAudioElement).volume),
            { signal: subscriptionCanceller.signal }
        );

        nativePlayerRef.current?.addEventListener(
            "timeupdate",
            (e) => {
                setTotalLength((e.currentTarget as HTMLAudioElement).duration);
                setCurrentTime((e.currentTarget as HTMLAudioElement).currentTime);
            },
            { signal: subscriptionCanceller.signal }
        );

        return () => {
            subscriptionCanceller.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nativePlayerRef.current]);

    // Note: 自動再生
    useEffect(() => {
        const p = nativePlayerRef.current;
        if (!p) return;

        p.volume = volume;
        p.play();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nativePlayerRef.current, source]);

    const onSeek = (e: ChangeEvent<HTMLInputElement>) => {
        const p = nativePlayerRef.current;
        if (!p) return;

        p.fastSeek(Number(e.currentTarget.value));
    };
    const onStop = () => {
        const p = nativePlayerRef.current;
        if (!p) return;

        p.pause();
        p.currentTime = 0;
    };
    const onPlayPause = () => {
        const p = nativePlayerRef.current;
        if (!p) return;

        if (isPlaying) {
            p.pause();
        } else {
            p.play();
        }
    };
    const onFastRewind = () => {
        const p = nativePlayerRef.current;
        if (!p) return;

        p.fastSeek(p.currentTime + 10.0);
    };
    const onFastForward = () => {
        const p = nativePlayerRef.current;
        if (!p) return;

        p.fastSeek(p.currentTime - 10.0);
    };
    const onVolumeChanged = (e: ChangeEvent<HTMLInputElement>) => {
        const p = nativePlayerRef.current;
        if (!p) return;

        p.volume = Number(e.currentTarget.value);
    };

    return (
        <section id="Player">
            <h1 id="PlayerPlayingArea">{title}</h1>
            <section id="PlayerSeekBar">
                <input type="range" min={0} max={totalLength} step={0.01} value={currentTime} onChange={onSeek} />
                {toTimecode(currentTime)}/{toTimecode(totalLength)}
            </section>
            <section id="PlayerControls">
                <button type="button" onClick={onFastRewind}>
                    <span className="material-symbols-outlined">fast_rewind</span>
                </button>
                <button type="button" onClick={onStop}>
                    <span className="material-symbols-outlined">stop</span>
                </button>
                <button type="button" className="Main" onClick={onPlayPause}>
                    <span className="material-symbols-outlined">{isPlaying ? "pause" : "play_arrow"}</span>
                </button>
                <button type="button" onClick={onFastForward}>
                    <span className="material-symbols-outlined">fast_forward</span>
                </button>
            </section>
            <section id="PlayerVolumeControls">
                <span className="material-symbols-outlined">volume_down</span>
                <input type="range" min={0} max={1} step={0.01} value={volume} onChange={onVolumeChanged} />
                <span className="material-symbols-outlined">volume_up</span>
            </section>
            <audio src={source} ref={nativePlayerRef} />
        </section>
    );
}

function toTimecode(sec: number): string {
    const min = Math.trunc(sec / 60);

    return `${min.toFixed(0)}:${Math.trunc(sec % 60)
        .toFixed(0)
        .padStart(2, "0")}`;
}

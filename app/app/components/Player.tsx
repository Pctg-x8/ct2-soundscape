import { useNavigation } from "@remix-run/react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { LocalStorage } from "src/localStorage";

export default function Player({ source, title }: { readonly source?: string; readonly title: string }) {
    const nativePlayerRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setPlaying] = useState(false);
    const [volume, setVolume] = useState(() => LocalStorage.Volume.get() ?? 1);
    const [totalLength, setTotalLength] = useState(0);
    const [loadedLength, setLoadedLength] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const state = useNavigation();
    const [playQueued, setPlayQueued] = useState(false);

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
            (e) => {
                LocalStorage.Volume.set((e.currentTarget as HTMLAudioElement).volume);
                setVolume((e.currentTarget as HTMLAudioElement).volume);
            },
            { signal: subscriptionCanceller.signal }
        );

        nativePlayerRef.current?.addEventListener(
            "timeupdate",
            (e) => {
                setCurrentTime((e.currentTarget as HTMLAudioElement).currentTime);
            },
            { signal: subscriptionCanceller.signal }
        );
        nativePlayerRef.current?.addEventListener(
            "durationchange",
            (e) => setTotalLength((e.currentTarget as HTMLAudioElement).duration),
            { signal: subscriptionCanceller.signal }
        );
        nativePlayerRef.current?.addEventListener(
            "progress",
            (e) => console.log((e.currentTarget as HTMLAudioElement).buffered),
            { signal: subscriptionCanceller.signal }
        );

        if (nativePlayerRef.current) {
            nativePlayerRef.current.volume = volume;
            setTotalLength(nativePlayerRef.current.duration);
            setCurrentTime(nativePlayerRef.current.currentTime);
        }

        return () => {
            subscriptionCanceller.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nativePlayerRef.current]);

    useEffect(() => {
        if (state.state === "loading") {
            setPlayQueued(state.location?.state["autoplay"] === true);
        }
    }, [state.location, state.state]);

    useEffect(() => {
        if (nativePlayerRef.current && playQueued) {
            nativePlayerRef.current.play();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nativePlayerRef.current, source, state.state, playQueued]);

    // const onSeek = (e: ChangeEvent<HTMLInputElement>) => {
    //     const p = nativePlayerRef.current;
    //     if (!p) return;

    //     p.currentTime = Number(e.currentTarget.value);
    // };
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

        p.currentTime += 10;
    };
    const onFastForward = () => {
        const p = nativePlayerRef.current;
        if (!p) return;

        p.currentTime -= 10;
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
                <section id="PlayerSeekBarMain">
                    <div id="PlayerSeekBarBackground" />
                    <div id="PlayerSeekBarLoaded" />
                    <div id="PlayerSeekBarPlayed" style={{ width: `${(100 * currentTime) / totalLength}%` }} />
                </section>
                <p>
                    {toTimecode(currentTime)}/{toTimecode(totalLength)}
                </p>
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

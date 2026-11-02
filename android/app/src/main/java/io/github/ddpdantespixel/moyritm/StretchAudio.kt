package io.github.ddpdantespixel.moyritm

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.SystemClock
import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.PI
import kotlin.math.sin

/** Short native sonification; no audio-focus, volume, ducking or silent keepalive calls. */
internal class StretchAudio {
    private val executor = Executors.newSingleThreadExecutor()
    private val generation = AtomicLong()
    @Volatile private var active: AudioTrack? = null

    fun cancel() {
        generation.incrementAndGet()
        val track = active
        try { track?.pause(); track?.flush(); track?.stop() } catch (_: IllegalStateException) { }
    }

    fun play(final: Boolean, allowed: () -> Boolean, done: (Boolean) -> Unit) {
        val token = generation.get()
        executor.execute {
            var track: AudioTrack? = null
            var played = false
            try {
                if (token != generation.get() || !allowed()) return@execute
                val samples = signal(final)
                track = AudioTrack.Builder()
                    .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                    .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(RATE).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setTransferMode(AudioTrack.MODE_STATIC).setBufferSizeInBytes(samples.size * 2).build()
                active = track
                if (token != generation.get() || !allowed()) return@execute
                if (track.write(samples, 0, samples.size, AudioTrack.WRITE_BLOCKING) != samples.size) return@execute
                val start = SystemClock.elapsedRealtime()
                track.play()
                // Consumption is evidence of playback progression, never a claim of physical audibility.
                while (token == generation.get() && allowed() && track.playbackHeadPosition < samples.size &&
                    SystemClock.elapsedRealtime() - start < 2_000) Thread.sleep(10)
                played = token == generation.get() && track.playbackHeadPosition >= samples.size
                Log.i(TAG, "PCM consumed=$played frames=${track.playbackHeadPosition} expected=${samples.size} elapsed=${SystemClock.elapsedRealtime()}")
            } catch (e: Exception) { Log.e(TAG, "Native audio failed: ${e.javaClass.simpleName}") }
            finally {
                if (active === track) active = null
                try { track?.stop() } catch (_: IllegalStateException) { }
                track?.release()
                done(played)
            }
        }
    }

    fun close() { cancel(); executor.shutdownNow() }

    companion object {
        const val TAG = "MoyRitmStretch"
        const val RATE = 48_000
        fun signal(final: Boolean): ShortArray {
            val pulse = if (final) 180 else 110
            val gap = 90
            val size = RATE * (3 * pulse + 2 * gap) / 1000
            return ShortArray(size) { index ->
                val ms = index * 1000.0 / RATE
                val section = (ms / (pulse + gap)).toInt()
                val within = ms - section * (pulse + gap)
                if (section >= 3 || within >= pulse) 0 else {
                    val envelope = minOf(1.0, within / 5, (pulse - within) / 5).coerceAtLeast(0.0)
                    (sin(2 * PI * (if (final) 1046.5 else 880.0) * index / RATE) * 12_000 * envelope).toInt().toShort()
                }
            }
        }
    }
}

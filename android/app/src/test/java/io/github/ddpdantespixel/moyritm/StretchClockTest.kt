package io.github.ddpdantespixel.moyritm

import org.junit.Assert.*
import org.junit.Test

class StretchClockTest {
    private fun session() = StretchSession("test", anchorMs = 10_000, startedAt = 1_800_000_000_000, dateId = "2026-11-02")

    @Test fun fiveBoundariesAreExactAutomaticAndOnce() {
        var s = session()
        for ((index, elapsed) in StretchSession.CURRENT.withIndex()) {
            assertEquals(0, StretchClock.advance(s, 10_000 + elapsed - 1).boundary)
            val event = StretchClock.advance(s, 10_000 + elapsed)
            assertEquals(index + 1, event.boundary)
            assertTrue(event.audible)
            s = event.state
            assertEquals(0, StretchClock.advance(s, 10_000 + elapsed).boundary)
        }
        assertEquals("completed", s.status)
        assertEquals(0L, s.remainingStage(999_999))
        assertEquals(0, StretchClock.advance(s, 999_999).boundary)
    }

    @Test fun pauseExcludesPausedTimeAndStopCancelsProgress() {
        val paused = StretchClock.pause(session(), 110_000)
        assertEquals(100_000L, paused.elapsed(5_000_000))
        val resumed = StretchClock.resume(paused, 1_000_000)
        assertEquals(0, StretchClock.advance(resumed, 1_199_999).boundary)
        assertEquals(1, StretchClock.advance(resumed, 1_200_000).boundary)
        val stopped = StretchClock.stop(resumed, 1_100_000)
        assertEquals(0, StretchClock.advance(stopped, 9_999_999).boundary)
    }

    @Test fun delayedWakeDoesNotQueueOldSounds() {
        val late = StretchClock.advance(session(), 600_000)
        assertEquals(4, late.boundary)
        assertTrue(late.late)
        assertFalse(late.audible)
        assertEquals(0, StretchClock.advance(late.state, 600_001).boundary)
        assertFalse(StretchClock.advance(session().copy(delivered = 4), 9_000_000).audible)
    }

    @Test fun processDeathRestoresPausedWithoutAudioAndRebootUsesCheckpoint() {
        val s = session()
        val recovered = StretchClock.recover(s, 420_000, 0)
        assertEquals("paused", recovered.status)
        assertEquals(410_000L, recovered.elapsedMs)
        assertEquals(0, StretchClock.advance(recovered, 500_000).boundary)
        val checkpoint = s.copy(elapsedMs = 45_000, anchorMs = 55_000)
        assertEquals(45_000L, StretchClock.recover(checkpoint, 500, 1).elapsedMs)
    }

    @Test fun wallClockAndDateDoNotDriveElapsedTime() {
        val s = session()
        val changedWall = s.copy(startedAt = 0, dateId = "2027-01-01")
        assertEquals(s.elapsed(310_000), changedWall.elapsed(310_000))
        assertEquals(1, StretchClock.advance(changedWall, 310_000).boundary)
    }

    @Test fun legacySessionKeepsItsStageTitles() {
        val legacy = session().copy(plan = 1)
        assertEquals("90/90", StretchSession.names(legacy.plan)[legacy.stage(10_000)])
        assertEquals("Поза ребёнка", StretchSession.names(2)[0])
        assertEquals("Поза ребёнка", StretchSession.names(1)[4])
    }
}

"""Sample 04: Python asyncio + threading hang scenario.

Starts:
- One asyncio task (`wait_for_never_set_event`) awaiting an `asyncio.Event` that is never set.
- One asyncio task (`wait_on_blocked_executor`) awaiting `loop.run_in_executor` into a thread
  (`blocked_lock_worker`) blocked on a held `threading.Lock`.
- Two idle worker threads (`idle-worker-1`, `idle-worker-2`) waiting on `threading.Event().wait()`.
- One heartbeat task (`heartbeat_task`) printing a line every second so you can verify the process
  stays live and is not paused during runtime dumps.

Run directly or under debugpy:
    python -m debugpy --listen 5678 app.py
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
import threading
import time
from typing import Callable


class AsyncHangScenario:
    """Encapsulates the sample's threads, locks, and asyncio tasks."""

    def __init__(self) -> None:
        self.stop_event = threading.Event()
        self.held_lock = threading.Lock()
        # Acquire once on the setup thread and never release while running.
        self.held_lock.acquire()

        self.blocked_worker_entered = threading.Event()
        self.idle_workers_ready = [threading.Event(), threading.Event()]
        self.tasks_ready = threading.Event()

        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="blocked-executor")
        self.idle_threads: list[threading.Thread] = []
        self.loop: asyncio.AbstractEventLoop | None = None
        self.tasks: list[asyncio.Task[object]] = []

    def _idle_worker(self, index: int) -> None:
        self.idle_workers_ready[index].set()
        self.stop_event.wait()

    def start_background_threads(self) -> None:
        for i in range(2):
            t = threading.Thread(
                target=self._idle_worker,
                args=(i,),
                name=f"idle-worker-{i + 1}",
                daemon=True,
            )
            t.start()
            self.idle_threads.append(t)

        for ev in self.idle_workers_ready:
            ev.wait(timeout=5.0)

    def blocked_lock_worker(self) -> str:
        self.blocked_worker_entered.set()
        # Blocks until shutdown releases held_lock.
        with self.held_lock:
            return "acquired"

    async def wait_for_never_set_event(self, never_event: asyncio.Event) -> None:
        await never_event.wait()

    async def wait_on_blocked_executor(self) -> str:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self.executor, self.blocked_lock_worker)

    async def heartbeat_task(self, on_tick: Callable[[int], None] | None = None) -> None:
        tick = 0
        while not self.stop_event.is_set():
            tick += 1
            if on_tick is not None:
                on_tick(tick)
            else:
                print(f"[heartbeat] tick={tick} ts={time.time():.3f}", flush=True)
            await asyncio.sleep(1.0)

    async def start_tasks(
        self,
        *,
        enable_heartbeat_print: bool = True,
    ) -> list[asyncio.Task[object]]:
        self.loop = asyncio.get_running_loop()
        never_event = asyncio.Event()

        t_event = asyncio.create_task(
            self.wait_for_never_set_event(never_event),
            name="event-waiter-task",
        )
        t_exec = asyncio.create_task(
            self.wait_on_blocked_executor(),
            name="executor-waiter-task",
        )
        t_hb = asyncio.create_task(
            self.heartbeat_task(None if enable_heartbeat_print else (lambda _tick: None)),
            name="heartbeat-task",
        )
        self.tasks = [t_event, t_exec, t_hb]

        # Yield twice so all tasks enter their first await point and the executor thread starts.
        await asyncio.sleep(0.05)
        self.blocked_worker_entered.wait(timeout=5.0)
        self.tasks_ready.set()
        return self.tasks

    def shutdown(self) -> None:
        self.stop_event.set()
        try:
            self.held_lock.release()
        except RuntimeError:
            pass
        for t in self.tasks:
            t.cancel()
        self.executor.shutdown(wait=False, cancel_futures=True)


async def main() -> None:
    scenario = AsyncHangScenario()
    scenario.start_background_threads()
    tasks = await scenario.start_tasks(enable_heartbeat_print=True)
    try:
        await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        pass
    finally:
        scenario.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass

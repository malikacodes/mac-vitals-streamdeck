// Runs a job again and again on a timer, one at a time. It's the loop
// behind the stat keys, pulled out so a test can run it with the clock
// in its hands.
//
// A plain setInterval starts the next run on the dot whether or not
// the last one has finished. A job that asks the Mac something can
// hang, and then every tick adds another copy of it, all waiting on
// the same thing. So a tick that lands while the job is still running
// is skipped. Nothing is lost: the next tick takes a fresh reading.
//
// A job that fails gets written to the log once, when it starts
// failing. Then it's left alone until it works again, because the same
// line every two seconds hides anything new in the log.
export function poll(job, ms, log) {
  let busy = false;
  let failing = false;
  const turn = async () => {
    if (busy) return;
    busy = true;
    try {
      await job();
      failing = false;
    } catch (err) {
      if (!failing) log(err.message);
      failing = true;
    } finally {
      busy = false;
    }
  };
  turn();
  return setInterval(turn, ms);
}

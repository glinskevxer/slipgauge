/**
 * Reads the room loggers and posts what they hold at the registry.
 *
 * <p>Run as its own process rather than inside the service. The loggers are on
 * the laboratory network, they go away for a week at a time when somebody
 * unplugs one, and none of that should be able to hold up a request from a
 * bench. It is started by the compose file under the loggers profile and by
 * cron everywhere else.
 *
 * <p>Deliberately small and dependency free. It has one job, it is the only
 * thing in the repository that talks to hardware, and the day it stops working
 * somebody has to be able to read the whole of it in one sitting.
 */

interface LoggerSample {
  readonly takenAt: string;
  readonly temperature: number;
  readonly humidity?: number;
}

interface PollSettings {
  readonly api: string;
  readonly loggerHost: string;
  readonly token: string;
  readonly rooms: readonly { readonly locationCode: string; readonly loggerRef: string }[];
}

/** Reads the settings, refusing rather than guessing at anything missing. */
export function settingsFrom(env: NodeJS.ProcessEnv): PollSettings {
  const api = env['REGISTRY_API'];
  const loggerHost = env['REGISTRY_LOGGER_HOST'];
  const token = env['REGISTRY_LOGGER_TOKEN'];

  if (!api || !loggerHost || !token) {
    throw new Error(
      'REGISTRY_API, REGISTRY_LOGGER_HOST and REGISTRY_LOGGER_TOKEN all have to be set',
    );
  }
  return { api, loggerHost, token, rooms: roomsFrom(env['REGISTRY_LOGGER_ROOMS'] ?? '') };
}

/**
 * The room list, written as `HARLOW-DIM=TINYTAG-4471,CREWE-TOOL=TINYTAG-4472`.
 *
 * <p>A pair per room rather than a lookup on the logger's own name: the loggers
 * are relabelled when they are swapped and the room is not.
 */
export function roomsFrom(setting: string): { locationCode: string; loggerRef: string }[] {
  return setting
    .split(',')
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const [locationCode, loggerRef] = pair.split('=').map((part) => part.trim());

      if (!locationCode || !loggerRef) {
        throw new Error(`"${pair}" is not a room=logger pair`);
      }
      return { locationCode, loggerRef };
    });
}

/**
 * Turns what a logger hands back into what the registry takes.
 *
 * <p>The loggers report in whole minutes and sometimes repeat the last sample
 * when they have nothing new, so the duplicates are dropped here as well as at
 * the far end. Dropping them here keeps the request small; dropping them there
 * is what makes it correct.
 */
export function toSamples(raw: unknown): LoggerSample[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const samples: LoggerSample[] = [];

  for (const row of raw) {
    const record = row as Record<string, unknown>;
    const takenAt = String(record['timestamp'] ?? record['takenAt'] ?? '');
    const temperature = Number(record['temperature'] ?? record['temp']);

    if (!takenAt || !Number.isFinite(temperature) || seen.has(takenAt)) {
      continue;
    }
    seen.add(takenAt);

    const humidity = Number(record['humidity'] ?? record['rh']);

    samples.push({
      takenAt: new Date(takenAt).toISOString(),
      temperature,
      ...(Number.isFinite(humidity) ? { humidity } : {}),
    });
  }
  return samples.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

async function readLogger(settings: PollSettings, loggerRef: string): Promise<LoggerSample[]> {
  const response = await fetch(`${settings.loggerHost}/loggers/${loggerRef}/readings`, {
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`${loggerRef} answered ${response.status}`);
  }
  return toSamples(await response.json());
}

async function post(
  settings: PollSettings,
  locationCode: string,
  loggerRef: string,
  readings: readonly LoggerSample[],
): Promise<void> {
  const response = await fetch(`${settings.api}/environment/readings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${settings.token}`,
    },
    body: JSON.stringify({ locationCode, loggerRef, source: 'LOGGER', readings }),
  });

  if (!response.ok) {
    throw new Error(`the registry answered ${response.status} for ${locationCode}`);
  }
  const result = (await response.json()) as { accepted: number; duplicates: number };

  process.stdout.write(
    `${locationCode}: ${result.accepted} accepted, ${result.duplicates} already held\n`,
  );
}

/**
 * One pass over every room. A logger that is unreachable is reported and
 * stepped over: one unplugged sensor must not stop the other three being read.
 */
export async function poll(settings: PollSettings): Promise<number> {
  let failures = 0;

  for (const room of settings.rooms) {
    try {
      const readings = await readLogger(settings, room.loggerRef);

      if (readings.length === 0) {
        process.stdout.write(`${room.locationCode}: nothing new\n`);
        continue;
      }
      await post(settings, room.locationCode, room.loggerRef, readings);
    } catch (error) {
      failures += 1;
      process.stderr.write(`${room.locationCode}: ${(error as Error).message}\n`);
    }
  }
  return failures;
}

/* istanbul ignore next -- the entry point, exercised by running it */
if (require.main === module) {
  poll(settingsFrom(process.env))
    .then((failures) => process.exit(failures > 0 ? 1 : 0))
    .catch((error: Error) => {
      process.stderr.write(`${error.message}\n`);
      process.exit(2);
    });
}

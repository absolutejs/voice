import { expect, test } from 'bun:test';
import { bindVoiceBargeIn } from '../src/client/duplex';

const createFakeController = () => {
	let partial = '';
	const subscribers = new Set<() => void>();
	const sentAudio: Array<Uint8Array | ArrayBuffer> = [];

	return {
		get partial() {
			return partial;
		},
		emitPartial(next: string) {
			partial = next;
			for (const subscriber of subscribers) {
				subscriber();
			}
		},
		getSentAudio() {
			return sentAudio;
		},
		sendAudio(audio: Uint8Array | ArrayBuffer) {
			sentAudio.push(audio);
		},
		subscribe(subscriber: () => void) {
			subscribers.add(subscriber);

			return () => {
				subscribers.delete(subscriber);
			};
		}
	};
};

const createFakePlayer = () => {
	let isPlaying = true;
	let interruptCount = 0;

	return {
		get interruptCount() {
			return interruptCount;
		},
		get isPlaying() {
			return isPlaying;
		},
		async interrupt() {
			interruptCount += 1;
			isPlaying = false;
		},
		reset() {
			isPlaying = true;
		}
	};
};

test('bindVoiceBargeIn interrupts playback on manual audio send', async () => {
	const controller = createFakeController();
	const player = createFakePlayer();
	const binding = bindVoiceBargeIn(controller as never, player as never);

	const audio = new Uint8Array([1, 2, 3]);
	binding.sendAudio(audio);
	await Bun.sleep(0);

	expect(player.interruptCount).toBe(1);
	expect(controller.getSentAudio()).toEqual([audio]);

	binding.close();
});

test('bindVoiceBargeIn interrupts when controller partial starts', async () => {
	const controller = createFakeController();
	const player = createFakePlayer();
	const binding = bindVoiceBargeIn(controller as never, player as never);

	controller.emitPartial('hello there');
	await Bun.sleep(0);

	expect(player.interruptCount).toBe(1);

	binding.close();
});

test('bindVoiceBargeIn interrupts when input level crosses the threshold', async () => {
	const controller = createFakeController();
	const player = createFakePlayer();
	const binding = bindVoiceBargeIn(controller as never, player as never, {
		interruptThreshold: 0.2
	});

	binding.handleLevel(0.1);
	await Bun.sleep(0);
	expect(player.interruptCount).toBe(0);

	player.reset();
	binding.handleLevel(0.25);
	await Bun.sleep(0);
	expect(player.interruptCount).toBe(1);

	binding.close();
});

test('bindVoiceBargeIn can disable partial-triggered interruption', async () => {
	const controller = createFakeController();
	const player = createFakePlayer();
	const binding = bindVoiceBargeIn(controller as never, player as never, {
		interruptOnPartial: false
	});

	controller.emitPartial('hello there');
	await Bun.sleep(0);
	expect(player.interruptCount).toBe(0);

	binding.close();
});

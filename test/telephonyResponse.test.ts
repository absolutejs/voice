import { expect, test } from 'bun:test';
import { shapeTelephonyAssistantText } from '../src/telephony/response';

test('shapeTelephonyAssistantText returns the lead clause by default', () => {
	expect(
		shapeTelephonyAssistantText(
			'You said: Go quietly alone. No harm will befall you.'
		)
	).toBe('Go quietly alone.');
});

test('shapeTelephonyAssistantText can preserve a longer lead phrase with a higher word cap', () => {
	expect(
		shapeTelephonyAssistantText(
			'Go quietly alone no harm will befall you right now.',
			{ maxWords: 8 }
		)
	).toBe('Go quietly alone no harm will befall you.');
});

test('shapeTelephonyAssistantText can bypass shaping in full mode', () => {
	expect(
		shapeTelephonyAssistantText(
			'You said: Go quietly alone. No harm will befall you.',
			{ mode: 'full' }
		)
	).toBe('You said: Go quietly alone. No harm will befall you.');
});

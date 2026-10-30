import test from 'node:test';
import assert from 'node:assert/strict';
import { fixMisreads } from '../extension/lib/ocr-fixes.js';

test('Al becomes AI in ordinary sentences', () => {
  assert.equal(fixMisreads('Al does the work for you'), 'AI does the work for you');
  assert.equal(fixMisreads('how Al learns, and why Al.'), 'how AI learns, and why AI.');
  assert.equal(fixMisreads("Al's future"), "AI's future");
});

test('Al becomes AI in compounds and product names', () => {
  assert.equal(fixMisreads('Al-powered search'), 'AI-powered search');
  assert.equal(fixMisreads('OpenAl and GenAl tools'), 'OpenAI and GenAI tools');
});

test('Al becomes AI next to Arabic and in capitals', () => {
  assert.equal(fixMisreads('يستخدم Al في العمل'), 'يستخدم AI في العمل');
  assert.equal(fixMisreads('Al MODELS'), 'AI MODELS');
});

test('common AI terms in titles are fixed', () => {
  assert.equal(fixMisreads('Al Agents and Al Tools'), 'AI Agents and AI Tools');
});

test('names stay as they are', () => {
  assert.equal(fixMisreads('Al Gore gave a speech'), 'Al Gore gave a speech');
  assert.equal(fixMisreads('Nasser Al Nooh'), 'Nasser Al Nooh');
  assert.equal(fixMisreads('Al-Jazeera reported'), 'Al-Jazeera reported');
});

test('words that only contain Al stay as they are', () => {
  assert.equal(fixMisreads('Alice and Algebra'), 'Alice and Algebra');
});

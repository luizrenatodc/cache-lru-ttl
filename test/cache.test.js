import { test } from "node:test";
import assert from "node:assert/strict";
import { CacheLRU, comCache } from "../src/cache.js";

const relogio = () => { let t = 0; const f = () => t; f.avanca = (ms) => (t += ms); return f; };

test("despeja o menos usado recentemente", () => {
  const c = new CacheLRU({ max: 2 });
  c.definir("a", 1).definir("b", 2);
  c.obter("a"); // a vira o mais recente
  c.definir("c", 3);
  assert.equal(c.obter("b"), undefined);
  assert.equal(c.obter("a"), 1);
  assert.equal(c.estatisticas.despejos, 1);
});

test("item vence pelo TTL", () => {
  const r = relogio();
  const c = new CacheLRU({ ttlMs: 100, relogio: r });
  c.definir("x", "v");
  r.avanca(99);
  assert.equal(c.obter("x"), "v");
  r.avanca(1);
  assert.equal(c.obter("x"), undefined);
});

test("chamadas simultâneas carregam a origem uma única vez", async () => {
  const c = new CacheLRU();
  let chamadas = 0;
  const lento = async () => { chamadas++; await new Promise((r) => setTimeout(r, 20)); return "dado"; };
  const res = await Promise.all(Array.from({ length: 100 }, () => c.buscar("k", lento)));
  assert.equal(chamadas, 1);
  assert.ok(res.every((v) => v === "dado"));
});

test("erro na origem não fica preso no cache", async () => {
  const c = new CacheLRU();
  await assert.rejects(c.buscar("k", async () => { throw new Error("fora do ar"); }));
  assert.equal(await c.buscar("k", async () => "voltou"), "voltou");
});

test("stale-while-revalidate devolve o velho e atualiza em segundo plano", async () => {
  const r = relogio();
  const c = new CacheLRU({ ttlMs: 100, staleMs: 1000, relogio: r });
  c.definir("preco", 10);
  r.avanca(150);
  assert.equal(await c.buscar("preco", async () => 12), 10);
  await new Promise((ok) => setImmediate(ok));
  assert.equal(c.obter("preco"), 12);
});

test("taxa de acerto nas estatísticas", () => {
  const c = new CacheLRU();
  c.definir("a", 1);
  c.obter("a"); c.obter("a"); c.obter("b");
  assert.equal(c.estatisticas.taxaAcerto, 2 / 3);
});

test("comCache memoiza por argumentos", async () => {
  let n = 0;
  const cotacao = comCache(async (moeda) => { n++; return moeda === "USD" ? 5.1 : 6; }, { ttlMs: 1000 });
  await cotacao("USD"); await cotacao("USD"); await cotacao("EUR");
  assert.equal(n, 2);
  assert.equal(cotacao.cache.tamanho, 2);
});

test("max inválido é rejeitado", () => {
  assert.throws(() => new CacheLRU({ max: 0 }), RangeError);
});

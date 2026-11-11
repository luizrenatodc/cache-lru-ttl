// Cache LRU com TTL e proteção contra "estouro de manada" (cache stampede).
// - LRU em O(1) usando a ordem de inserção do Map (apaga e reinsere = mais recente)
// - TTL por item, com expiração preguiçosa na leitura
// - buscar(chave, carregar): se 100 pedidos chegam juntos para a mesma chave ausente,
//   só UM chama a origem; os outros esperam a mesma promessa (single-flight)
// - stale-while-revalidate opcional: devolve o valor vencido na hora e atualiza em segundo plano

export class CacheLRU {
  #mapa = new Map();
  #emVoo = new Map();
  #stats = { acertos: 0, faltas: 0, despejos: 0, carregamentos: 0 };

  constructor({ max = 1000, ttlMs = 60_000, staleMs = 0, relogio = Date.now } = {}) {
    if (max < 1) throw new RangeError("max deve ser >= 1");
    Object.assign(this, { max, ttlMs, staleMs, relogio });
  }

  get tamanho() { return this.#mapa.size; }
  get estatisticas() { const s = this.#stats; return { ...s, taxaAcerto: s.acertos / (s.acertos + s.faltas || 1) }; }

  definir(chave, valor, ttlMs = this.ttlMs) {
    this.#mapa.delete(chave);
    this.#mapa.set(chave, { valor, expira: this.relogio() + ttlMs });
    while (this.#mapa.size > this.max) {
      this.#mapa.delete(this.#mapa.keys().next().value);
      this.#stats.despejos++;
    }
    return this;
  }

  obter(chave) {
    const e = this.#mapa.get(chave);
    if (!e || e.expira <= this.relogio()) {
      if (e && e.expira + this.staleMs <= this.relogio()) this.#mapa.delete(chave);
      this.#stats.faltas++;
      return undefined;
    }
    this.#mapa.delete(chave);
    this.#mapa.set(chave, e); // vira o mais recente
    this.#stats.acertos++;
    return e.valor;
  }

  apagar(chave) { return this.#mapa.delete(chave); }
  limpar() { this.#mapa.clear(); }

  /** Lê do cache ou carrega da origem uma única vez, mesmo com chamadas simultâneas. */
  async buscar(chave, carregar, ttlMs = this.ttlMs) {
    const valor = this.obter(chave);
    if (valor !== undefined) return valor;
    const e = this.#mapa.get(chave);
    const vencidoUtilizavel = e && e.expira + this.staleMs > this.relogio();
    const promessa = this.#carregar(chave, carregar, ttlMs);
    if (vencidoUtilizavel) {
      promessa.catch(() => {}); // falha em segundo plano mantém o valor velho
      return e.valor;
    }
    return promessa;
  }

  #carregar(chave, carregar, ttlMs) {
    if (this.#emVoo.has(chave)) return this.#emVoo.get(chave);
    this.#stats.carregamentos++;
    const p = Promise.resolve()
      .then(() => carregar(chave))
      .then((v) => { this.definir(chave, v, ttlMs); return v; })
      .finally(() => this.#emVoo.delete(chave));
    this.#emVoo.set(chave, p);
    return p;
  }
}

/** Envolve uma função assíncrona com cache (memoização com LRU + TTL). */
export function comCache(fn, { chave = (...a) => JSON.stringify(a), ...opcoes } = {}) {
  const cache = new CacheLRU(opcoes);
  const envolvida = (...args) => cache.buscar(chave(...args), () => fn(...args));
  envolvida.cache = cache;
  return envolvida;
}

# cache-lru-ttl

Cache em memória para Node.js, **sem dependências**, pensado para quem chama APIs lentas ou caras (cotação, frete, consulta de CNPJ).

## O que resolve

- **LRU em O(1)**: quando enche, sai o item usado há mais tempo.
- **TTL por item**: dado vencido não é servido.
- **Single-flight (contra *cache stampede*)**: se 100 requisições pedem a mesma chave ao mesmo tempo, a origem é chamada **uma vez** e todas recebem o mesmo resultado.
- **Stale-while-revalidate**: responde na hora com o valor recém-vencido e atualiza em segundo plano, sem o usuário esperar.
- **Falha não envenena o cache**: erro da origem não fica guardado.
- **Estatísticas**: acertos, faltas, despejos, carregamentos e taxa de acerto.

## Uso

```js
import { CacheLRU, comCache } from "./src/cache.js";

const cache = new CacheLRU({ max: 5000, ttlMs: 60_000, staleMs: 300_000 });
const frete = await cache.buscar(`frete:${cep}`, () => consultarTransportadora(cep));

// ou memoizando uma função inteira
const cotacao = comCache(buscarCotacao, { ttlMs: 30_000 });
await cotacao("USD");
```

## Testes

```bash
npm test   # 8 testes, incluindo 100 chamadas simultâneas carregando 1 vez só
```

## Decisões

- O `Map` do JavaScript guarda a ordem de inserção: apagar e reinserir torna o item o mais recente, sem lista ligada à parte.
- A expiração acontece na leitura, então não precisa de timer nenhum.
- O relógio é injetável, e os testes de TTL rodam sem esperar o tempo passar.

Licença MIT.

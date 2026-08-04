import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The console's nginx configuration, read the way the image reads it.
 *
 * <p>Nothing else in the suite covers this file, and it is the one part of the
 * deployment that can fail before any request is served. The container was
 * unable to start at all for as long as the proxies named the service as a
 * literal host, because nginx resolves those while it is parsing, so a console
 * with a perfectly good bundle would die with
 * <code>host not found in upstream</code> whenever the service was not already
 * up. The image build catches that eventually. It catches it in CI, minutes
 * later, with a message that reads like an infrastructure problem.
 */
const CONF = resolve(__dirname, '../../../ops/nginx/console.conf');

function conf(): string {
  return readFileSync(CONF, 'utf8');
}

/** Directive lines, comments and blank lines dropped, whitespace collapsed. */
function directives(): string[] {
  return conf()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.replace(/\s+/g, ' '));
}

function proxyPasses(): string[] {
  return directives()
    .filter((line) => line.startsWith('proxy_pass '))
    .map((line) => line.replace(/^proxy_pass\s+/, '').replace(/;$/, ''));
}

/** The `location <match>` heads, in the order nginx will read them. */
function locations(): string[] {
  return directives()
    .filter((line) => line.startsWith('location '))
    .map((line) => line.replace(/^location\s+/, '').replace(/\s*\{$/, ''));
}

describe('how the console reaches the service', () => {
  it('proxies somewhere at all', () => {
    expect(proxyPasses().length).toBeGreaterThan(0);
  });

  it('never names an upstream host literally', () => {
    for (const target of proxyPasses()) {
      const host = target.replace(/^https?:\/\//, '').split(/[:/]/)[0];

      expect(host.startsWith('$')).toBe(true);
    }
  });

  it('carries a resolver, because a variable upstream needs one', () => {
    expect(conf()).toMatch(/^\s*resolver\s+\S+/m);
  });

  it('gives the resolver a short validity, so a restart is picked up', () => {
    const [, seconds] = /resolver\s+[^;]*\bvalid=(\d+)s/.exec(conf()) ?? [];

    expect(seconds).toBeDefined();
    expect(Number(seconds)).toBeLessThanOrEqual(30);
  });

  it('bounds the resolver, so a dead DNS server cannot hang a request', () => {
    expect(conf()).toMatch(/^\s*resolver_timeout\s+\d+s;/m);
  });

  it('sets every variable it proxies to', () => {
    const set = new Set(
      directives()
        .filter((line) => line.startsWith('set $'))
        .map((line) => line.split(' ')[1]),
    );

    for (const target of proxyPasses()) {
      const name = target.replace(/^https?:\/\//, '').split(/[:/]/)[0];

      expect(set.has(name)).toBe(true);
    }
  });

  it('sends every proxy to the port the service listens on', () => {
    for (const target of proxyPasses()) {
      expect(target).toContain(':8080');
    }
  });

  it('forwards the caller on, so an audit entry is not attributed to nginx', () => {
    expect(conf()).toContain('proxy_set_header X-Real-IP $remote_addr');
    expect(conf()).toContain('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for');
  });
});

describe('what the console serves itself', () => {
  it('falls everything unknown through to the single page app', () => {
    expect(conf()).toContain('try_files $uri $uri/ /index.html');
  });

  it('matches the two upload routes before the general /api/ prefix', () => {
    const order = locations();
    const prefix = order.indexOf('/api/');

    expect(prefix).toBeGreaterThanOrEqual(0);
    expect(order).toContain('= /api/environment/readings');
    expect(order).toContain('= /api/instruments/import');
  });

  it('raises the body limit on both routes that carry a file', () => {
    const body = conf();

    for (const route of ['/api/environment/readings', '/api/instruments/import']) {
      const block = body.slice(body.indexOf(`location = ${route}`));

      expect(block.slice(0, block.indexOf('}'))).toMatch(/client_max_body_size \d+m;/);
    }
  });

  it('refuses to cache index.html, so a deploy reaches a bench straight away', () => {
    const body = conf();
    const block = body.slice(body.indexOf('location = /index.html'));

    expect(block.slice(0, block.indexOf('}'))).toContain('no-store');
  });

  it('caches the hashed bundle hard, because those names never come round again', () => {
    expect(conf()).toContain('Cache-Control "public, immutable"');
  });
});

describe('what the console refuses', () => {
  it('denies metrics to anything off the laboratory network', () => {
    const body = conf();
    const block = body.slice(body.indexOf('location = /metrics'));
    const metrics = block.slice(0, block.indexOf('}'));

    expect(metrics).toContain('deny all;');
    expect(metrics.indexOf('deny all;')).toBeGreaterThan(metrics.indexOf('allow 10.0.0.0/8;'));
  });

  it('states a content security policy rather than leaving it to a default', () => {
    expect(conf()).toContain("default-src 'self'");
    expect(conf()).toContain("frame-ancestors 'none'");
  });

  it('sets the framing and sniffing headers on every response', () => {
    for (const header of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy']) {
      expect(conf()).toMatch(new RegExp(`add_header ${header} [^;]+ always;`));
    }
  });

  it('opens and closes every brace', () => {
    const body = conf().replace(/#.*$/gm, '');

    expect(body.split('{').length).toBe(body.split('}').length);
  });
});

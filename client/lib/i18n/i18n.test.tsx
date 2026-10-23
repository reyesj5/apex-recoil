import { render, screen } from '@testing-library/react';
import { I18nextProvider, Trans } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import en from '@/locales/en.json';
import specs from '../../specs.json';
import { createI18n, localeFromPath, locales, resources } from './index';

type Catalog = { [key: string]: string | Catalog };

/** Every key of a catalog with its text, nested keys joined with dots */
function entries(catalog: Catalog, prefix = ''): [string, string][] {
  return Object.entries(catalog).flatMap(([key, value]) =>
    typeof value === 'string' ? [[prefix + key, value]] : entries(value, `${prefix}${key}.`),
  );
}

/** What a translation must keep: its {{placeholders}} and <tags> */
const markers = (text: string) => [...text.matchAll(/\{\{\w+\}\}|<\/?\w+>/g)].map((m) => m[0]).sort();

const english = new Map(entries(en));

describe('catalogs', () => {
  for (const locale of locales) {
    const catalog = new Map(entries(resources[locale].translation as Catalog));

    it(`${locale} has every key, and no others`, () => {
      expect([...catalog.keys()].sort()).toEqual([...english.keys()].sort());
    });

    it(`${locale} keeps every placeholder and tag`, () => {
      const differ = [...english].filter(
        ([key, text]) => markers(text).join() !== markers(catalog.get(key) ?? '').join(),
      );
      expect(differ.map(([key]) => key)).toEqual([]);
    });

    it(`${locale} names every weapon`, () => {
      const missing = specs.map((spec) => spec.name).filter((name) => !catalog.get(`weapons.name.${name}`));
      expect(missing).toEqual([]);
    });

    it(`${locale} has no empty text`, () => {
      expect([...catalog].filter(([, text]) => !text.trim()).map(([key]) => key)).toEqual([]);
    });
  }
});

describe('i18n', () => {
  it('translates at once, with the values filled in', () => {
    const ru = createI18n('ru');
    expect(ru.t('weapons.name.havoc_tc')).toBe('ХАОС');
    expect(
      ru.t('magazine.capacity', {
        label: ru.t('magazine.level', { level: 2 }),
        count: 28,
        unit: ru.t('magazine.rounds'),
      }),
    ).toBe('Ур. 2 (28 патронов)');
    expect(createI18n('en').t('stats.summary', { tries: 3, median: 78, best: 91, allTimeBest: 96 })).toBe(
      "Today's tries 3, median 78, best 91\nAll time best 96",
    );
  });

  it('fills a sentence’s links with elements', () => {
    render(
      <I18nextProvider i18n={createI18n('zh-CN')}>
        <Trans i18nKey="mobile.faq" components={{ faq: <a href="/faq">FAQ</a> }} />
      </I18nextProvider>,
    );
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/faq');
    expect(document.body).toHaveTextContent('同时请看 FAQ。');
  });

  it('finds the locale of a trainer path', () => {
    expect(localeFromPath('/')).toBe('en');
    expect(localeFromPath('/ru')).toBe('ru');
    expect(localeFromPath('/zh-CN')).toBe('zh-CN');
    expect(localeFromPath('/editor')).toBe('en');
  });
});

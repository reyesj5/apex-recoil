import { render, screen } from '@testing-library/react';
import { I18nextProvider, Trans } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import en from '@/locales/en.json';
import ru from '@/locales/ru.json';
import zhCN from '@/locales/zh-CN.json';
import specs from '../../specs.json';
import { createI18n, loadCatalog, localeFromPath, locales } from './index';

const catalogs = { en, ru, 'zh-CN': zhCN };

type Catalog = { [key: string]: string | Catalog };

/** Every key of a catalog with its text, nested keys joined with dots */
function entries(catalog: Catalog, prefix = ''): [string, string][] {
  return Object.entries(catalog).flatMap(([key, value]) =>
    typeof value === 'string' ? [[prefix + key, value]] : entries(value, `${prefix}${key}.`),
  );
}

/** What a translation must keep: its {{placeholders}} and <tags> */
const markers = (text: string) => [...text.matchAll(/\{\{\w+\}\}|<\/?\w+>/g)].map((m) => m[0]).sort();

// A text that depends on a number comes in the plural forms of each language, as i18next names them:
// rounds_one and rounds_other in English, plus rounds_few and rounds_many in Russian, only
// rounds_other in Chinese (the forms Intl.PluralRules gives each language)
const pluralForm = /_(zero|one|two|few|many|other)$/;
const baseKey = (key: string) => key.replace(pluralForm, '');
const baseKeys = (catalog: Map<string, string>) => [...new Set([...catalog.keys()].map(baseKey))].sort();

const english = new Map(entries(en));

describe('catalogs', () => {
  for (const locale of locales) {
    const catalog = new Map(entries(catalogs[locale] as Catalog));

    it(`${locale} has every key, and no others`, () => {
      expect(baseKeys(catalog)).toEqual(baseKeys(english));
    });

    it(`${locale} has every plural form its language uses`, () => {
      const forms = [...new Intl.PluralRules(locale).resolvedOptions().pluralCategories].sort();
      const plurals = new Set([...english.keys()].filter((key) => pluralForm.test(key)).map(baseKey));
      for (const key of plurals) {
        const present = [...catalog.keys()].filter((k) => baseKey(k) === key).map((k) => k.slice(key.length + 1));
        expect(present.sort(), key).toEqual(forms);
      }
    });

    it(`${locale} keeps every placeholder and tag`, () => {
      // Each plural form keeps what the English "other" form has
      const differ = [...catalog].filter(([key, text]) => {
        const source = english.get(key) ?? english.get(`${baseKey(key)}_other`) ?? '';
        return markers(source).join() !== markers(text).join();
      });
      expect(differ.map(([key]) => key)).toEqual([]);
    });

    it(`${locale} names every weapon`, () => {
      const missing = specs.map((spec) => spec.name).filter((name) => !catalog.get(`weapons.name.${name}`));
      expect(missing).toEqual([]);
    });

    it(`${locale} names no tag after an HTML void element`, () => {
      // Trans reads the tags as HTML, where <link> (like <br> or <img>) has no content: its text would
      // end up outside the element
      const voidTag = /<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)>/;
      expect([...catalog].filter(([, text]) => voidTag.test(text)).map(([key]) => key)).toEqual([]);
    });

    it(`${locale} has no empty text`, () => {
      expect([...catalog].filter(([, text]) => !text.trim()).map(([key]) => key)).toEqual([]);
    });
  }
});

describe('i18n', () => {
  it('translates at once, with the values filled in', () => {
    const ru = createI18n('ru', catalogs.ru);
    expect(ru.t('weapons.name.havoc_tc')).toBe('ХАОС');
    expect(
      ru.t('tier.option', {
        tier: ru.t('tier.levelLong', { level: 2 }),
        capacity: ru.t('units.rounds', { count: 28 }),
      }),
    ).toBe('Магазин уровня 2, 28 патронов');
    expect(createI18n('en').t('session.trendMedian', { median: 78 })).toBe('Median 78 (dashed)');
  });

  it('picks each language’s plural form', () => {
    const ru = createI18n('ru', catalogs.ru);
    expect([1, 3, 5, 21, 22, 25].map((count) => ru.t('units.rounds', { count }))).toEqual([
      '1 патрон',
      '3 патрона',
      '5 патронов',
      '21 патрон',
      '22 патрона',
      '25 патронов',
    ]);
    expect([1, 2].map((count) => createI18n('en').t('units.rounds', { count }))).toEqual(['1 round', '2 rounds']);
    expect(createI18n('zh-CN', zhCN).t('units.rounds', { count: 1 })).toBe('1 发');
  });

  it('fills a sentence’s links with elements', () => {
    render(
      <I18nextProvider i18n={createI18n('zh-CN', zhCN)}>
        <Trans i18nKey="tips.pointer" components={{ guide: <a href="/how">How</a> }} />
      </I18nextProvider>,
    );
    expect(screen.getByRole('link', { name: '方法' })).toHaveAttribute('href', '/how');
    expect(document.body).toHaveTextContent('在 Windows 鼠标设置中关闭“提高指针精确度”。方法');
  });

  it('loads a locale’s catalog when a page needs it', async () => {
    expect(await loadCatalog('ru')).toEqual(ru);
    // A text a catalog lacks falls back to English
    const zh = createI18n('zh-CN', { ...zhCN, topBar: {} });
    expect(zh.t('topBar.train')).toBe('Train');
  });

  it('finds the locale of a trainer path', () => {
    expect(localeFromPath('/')).toBe('en');
    expect(localeFromPath('/ru')).toBe('ru');
    expect(localeFromPath('/zh-CN')).toBe('zh-CN');
    expect(localeFromPath('/editor')).toBe('en');
  });
});

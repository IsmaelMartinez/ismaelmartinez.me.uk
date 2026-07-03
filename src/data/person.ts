import { socialLinks } from './links';

// Shared schema.org Person metadata rendered as JSON-LD on the home and
// about pages. Page-specific fields (description, knowsAbout) are spread
// on top where needed.
export const personJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Ismael Martinez',
  alternateName: 'Ismael Martinez Ramos',
  url: 'https://ismaelmartinez.me.uk',
  jobTitle: 'Principal Software Developer',
  worksFor: {
    '@type': 'Organization',
    name: 'Postcode Lottery'
  },
  homeLocation: {
    '@type': 'Place',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Edinburgh',
      addressCountry: 'GB'
    }
  },
  sameAs: socialLinks.map(link => link.url)
};

// Escapes < so the payload can never break out of its <script> tag.
export function toJsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

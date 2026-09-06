import fs from 'node:fs/promises';
import path from 'node:path';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import BlogPage from '../blog-page';
import ArticlePage from '../article-page';

const pages = {
    home: 'index.html',
    about: 'about.html',
    blog: 'blog.html',
    'blog-post': 'blog-post.html',
    contact: 'contact.html',
    'scam-awareness': 'scam-awareness.html',
    'success-stories': 'success-stories.html',
    'core-values': 'core-values.html',
    'privacy-policy': 'privacy-policy.html',
    'cookie-policy': 'cookie-policy.html',
    'terms-of-use': 'terms-of-use.html',
    disclaimer: 'disclaimer.html',
    'earnings-disclaimer': 'earnings-disclaimer.html',
    admin: 'admin.html',
};

export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams() {
    return Object.keys(pages).map((slug) => ({ slug: slug === 'home' ? [] : [slug] }));
}

function toNextLinks(html) {
    return html
        .replace(/(href|src)="images\//g, '$1="/images/')
        .replace(/(href|src)="assets\//g, '$1="/assets/')
        .replace(/(href|src)="styles\//g, '$1="/styles/')
        .replace(/(href|src)="scripts\//g, '$1="/scripts/')
        .replace(/href="index\.html/g, 'href="/')
        .replace(/href="([a-z-]+)\.html/g, 'href="/$1');
}

const getPageHtml = cache(async (slug) => {
    const fileName = pages[slug];
    if (!fileName) return null;
    const source = await fs.readFile(path.join(process.cwd(), fileName), 'utf8');
    const body = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
    return body ? toNextLinks(body.replace(/<script[\s\S]*?<\/script>/gi, '')) : null;
});

export async function generateMetadata({ params }) {
    const slug = (await params).slug?.[0] || 'home';
    return { title: slug === 'home' ? 'CarnegienFreedom | Legit Ways to Live Better, Smarter, and More Securely' : `${slug.replaceAll('-', ' ')} | CarnegienFreedom` };
}

export default async function LegacyPage({ params, searchParams }) {
    const slug = (await params).slug?.[0] || 'home';
    if (slug === 'blog') return <BlogPage />;
    if (slug === 'blog-post') return <ArticlePage slug={(await searchParams).slug} />;

    const html = await getPageHtml(slug);
    if (!html) notFound();

    return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

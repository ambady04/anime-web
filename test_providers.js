import fetch from 'node-fetch';

const tmdbId = 'tt0388629';
const season = 1;
const episode = 1;

const urls = [
    `https://vidsrc.net/embed/tv?imdb=${tmdbId}&season=${season}&episode=${episode}`,
    `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episode}`,
    `https://vidsrc.pro/embed/tv/${tmdbId}/${season}/${episode}`,
    `https://embed.su/embed/tv/${tmdbId}/${season}/${episode}`,
    `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
];

async function check() {
    for (const url of urls) {
        try {
            const res = await fetch(url, { redirect: 'manual' });
            console.log(url, '->', res.status);
            if (res.status === 301 || res.status === 302) {
                console.log('  Redirects to:', res.headers.get('location'));
            }
        } catch (e) {
            console.log(url, '-> Error:', e.message);
        }
    }
}
check();

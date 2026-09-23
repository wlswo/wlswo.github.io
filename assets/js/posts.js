/*
 * 글 목록(search.json)을 한 번만 받아 나눠 쓴다. Spotlight 와 달력이 쓴다.
 * 받다가 실패하면 다음에 다시 시도한다.
 */
let pending = null;

export function loadPosts() {
  if (!pending) {
    const src = document.body.dataset.postsSrc || '/search.json';
    pending = fetch(src, { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error(`search.json ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

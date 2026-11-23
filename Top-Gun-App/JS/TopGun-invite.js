export function getInviteCode() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const code = params.get("invite")?.trim().toUpperCase();
    return /^[A-Z0-9-]{1,9}$/.test(code || "") ? code : "";
}

export function invitePageUrl(page, code) {
    const url = new URL(page, window.location.href);
    if (code) url.hash = new URLSearchParams({ invite: code }).toString();
    return url.href;
}

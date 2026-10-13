module.exports = [
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/runtime-reacts.external.js [external] (next/dist/server/runtime-reacts.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/runtime-reacts.external.js", () => require("next/dist/server/runtime-reacts.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[project]/app/api/[..._path]/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DELETE",
    ()=>DELETE,
    "GET",
    ()=>GET,
    "OPTIONS",
    ()=>OPTIONS,
    "PATCH",
    ()=>PATCH,
    "POST",
    ()=>POST,
    "PUT",
    ()=>PUT
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
;
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
function isAllowedRequestContext(req) {
    const fetchSite = req.headers.get("sec-fetch-site");
    if (fetchSite !== null) {
        return fetchSite === "same-origin" || fetchSite === "none";
    }
    const origin = req.headers.get("origin");
    if (origin === null) return true;
    try {
        return new URL(origin).origin === req.nextUrl.origin;
    } catch  {
        return false;
    }
}
function crossOriginResponse() {
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Cross-origin requests are not allowed."
    }, {
        status: 403
    });
}
async function handleRequest(req, method) {
    if (!isAllowedRequestContext(req)) return crossOriginResponse();
    try {
        const apiUrl = process.env.LANGGRAPH_API_URL?.trim();
        if (!apiUrl) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "LANGGRAPH_API_URL is not configured."
            }, {
                status: 503
            });
        }
        const path = req.nextUrl.pathname.replace(/^\/?api\//, "");
        const searchParams = new URLSearchParams(req.nextUrl.search);
        searchParams.delete("_path");
        searchParams.delete("nxtP_path");
        const queryString = searchParams.toString() ? `?${searchParams.toString()}` : "";
        const headers = new Headers();
        const apiKey = process.env.LANGCHAIN_API_KEY?.trim();
        if (apiKey) headers.set("x-api-key", apiKey);
        const accept = req.headers.get("accept");
        if (accept) headers.set("accept", accept);
        const contentType = req.headers.get("content-type");
        if (contentType) headers.set("content-type", contentType);
        // Who's asking is decided by the LangGraph server's auth hook. Pass along
        // Cloudflare Access's signed identity token for when that's wired in.
        const accessToken = req.headers.get("cf-access-jwt-assertion");
        if (accessToken) headers.set("cf-access-jwt-assertion", accessToken);
        const options = {
            method,
            headers,
            redirect: "manual",
            signal: req.signal
        };
        if ([
            "POST",
            "PUT",
            "PATCH"
        ].includes(method)) {
            options.body = await req.text();
        }
        const res = await fetch(`${apiUrl}/${path}${queryString}`, options);
        if (res.status === 0 || res.status >= 300 && res.status < 400 && res.status !== 304 || res.type === "opaqueredirect") {
            await res.body?.cancel().catch(()=>undefined);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "LangGraph returned an unexpected redirect."
            }, {
                status: 502
            });
        }
        const responseHeaders = new Headers(res.headers);
        for (const name of [
            "access-control-allow-credentials",
            "access-control-allow-headers",
            "access-control-allow-methods",
            "access-control-allow-origin",
            "content-encoding",
            "content-length",
            "set-cookie",
            "transfer-encoding"
        ]){
            responseHeaders.delete(name);
        }
        responseHeaders.set("Cache-Control", "no-store");
        return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"](res.body, {
            status: res.status,
            statusText: res.statusText,
            headers: responseHeaders
        });
    } catch (e) {
        if (e instanceof Error) {
            const typedError = e;
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: typedError.message
            }, {
                status: typedError.status ?? 500
            });
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Unknown error"
        }, {
            status: 500
        });
    }
}
const GET = (req)=>handleRequest(req, "GET");
const POST = (req)=>handleRequest(req, "POST");
const PUT = (req)=>handleRequest(req, "PUT");
const PATCH = (req)=>handleRequest(req, "PATCH");
const DELETE = (req)=>handleRequest(req, "DELETE");
const OPTIONS = (req)=>isAllowedRequestContext(req) ? new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"](null, {
        status: 204,
        headers: {
            Allow: ALLOWED_METHODS
        }
    }) : crossOriginResponse();
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1en665q._.js.map
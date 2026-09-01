(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/features/attachment/repository/attachment-repository.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createAttachment",
    ()=>createAttachment,
    "listMomentAttachments",
    ()=>listMomentAttachments,
    "softDeleteAttachment",
    ()=>softDeleteAttachment
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db/client.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$identity$2f$create$2d$entity$2d$id$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/identity/create-entity-id.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$time$2f$timestamps$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/time/timestamps.ts [app-client] (ecmascript)");
;
;
;
function requireImage(mimeType) {
    if (!mimeType.startsWith("image/")) {
        throw new Error("Attachment must be an image.");
    }
}
async function createAttachment(input) {
    requireImage(input.mimeType);
    const createdAt = input.createdAt ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$time$2f$timestamps$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["nowTimestamp"])();
    const attachment = {
        ...input,
        id: input.id ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$identity$2f$create$2d$entity$2d$id$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createEntityId"])(),
        ownerType: "moment",
        kind: "image",
        size: input.size ?? input.blob.size,
        width: input.width ?? null,
        height: input.height ?? null,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null
    };
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].attachments.add(attachment);
    return attachment;
}
async function listMomentAttachments(momentId, options = {}) {
    const attachments = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].attachments.where("[ownerType+ownerId]").equals([
        "moment",
        momentId
    ]).sortBy("createdAt");
    return options.includeDeleted ? attachments : attachments.filter((attachment)=>attachment.deletedAt === null);
}
async function softDeleteAttachment(id, deletedAt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$time$2f$timestamps$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["nowTimestamp"])()) {
    const attachment = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].attachments.get(id);
    if (!attachment) {
        throw new Error(`Attachment not found: ${id}`);
    }
    const deleted = {
        ...attachment,
        deletedAt,
        updatedAt: deletedAt
    };
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].attachments.put(deleted);
    return deleted;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/features/moment/components/home-page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "HomePage",
    ()=>HomePage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$moment$2f$components$2f$quick$2d$moment$2d$record$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/moment/components/quick-moment-record.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$moment$2f$components$2f$recent$2d$moments$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/moment/components/recent-moments.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
function HomePage() {
    _s();
    const [recentRevision, setRecentRevision] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "home-page",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$moment$2f$components$2f$quick$2d$moment$2d$record$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["QuickMomentRecord"], {
                onSaved: ()=>setRecentRevision((current)=>current + 1)
            }, void 0, false, {
                fileName: "[project]/src/features/moment/components/home-page.tsx",
                lineNumber: 14,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                className: "home-secondary-nav",
                "aria-label": "更多功能",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    href: "/diary",
                    children: "日记"
                }, void 0, false, {
                    fileName: "[project]/src/features/moment/components/home-page.tsx",
                    lineNumber: 15,
                    columnNumber: 61
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/features/moment/components/home-page.tsx",
                lineNumber: 15,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$moment$2f$components$2f$recent$2d$moments$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["RecentMoments"], {
                refreshKey: recentRevision
            }, void 0, false, {
                fileName: "[project]/src/features/moment/components/home-page.tsx",
                lineNumber: 16,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/features/moment/components/home-page.tsx",
        lineNumber: 13,
        columnNumber: 5
    }, this);
}
_s(HomePage, "vwde3T5wOYtwgqZgWZsWQmnglnA=");
_c = HomePage;
var _c;
__turbopack_context__.k.register(_c, "HomePage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/features/moment/components/moment-appends.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MomentAppends",
    ()=>MomentAppends
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$moment$2f$repository$2f$moment$2d$repository$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/moment/repository/moment-repository.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
function formatAppendTime(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(new Date(timestamp));
}
function MomentAppends({ momentId }) {
    _s();
    const [appends, setAppends] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [isWriting, setIsWriting] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [text, setText] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [isSaving, setIsSaving] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [refreshRevision, setRefreshRevision] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const [readError, setReadError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [saveError, setSaveError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const isSubmittingRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MomentAppends.useEffect": ()=>{
            let isCurrent = true;
            async function load() {
                try {
                    const stored = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$moment$2f$repository$2f$moment$2d$repository$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["listMomentAppends"])(momentId);
                    if (!isCurrent) return;
                    setAppends(stored);
                    setReadError(null);
                } catch  {
                    if (isCurrent) setReadError("追加内容暂时无法读取。");
                }
            }
            void load();
            return ({
                "MomentAppends.useEffect": ()=>{
                    isCurrent = false;
                }
            })["MomentAppends.useEffect"];
        }
    }["MomentAppends.useEffect"], [
        momentId,
        refreshRevision
    ]);
    function beginWriting() {
        setSaveError(null);
        setIsWriting(true);
    }
    function cancelWriting() {
        if (isSubmittingRef.current) return;
        if (text.trim().length > 0 && !window.confirm("放弃这条尚未保存的追加？")) return;
        setText("");
        setSaveError(null);
        setIsWriting(false);
    }
    async function saveAppend() {
        if (isSubmittingRef.current) return;
        if (text.trim().length === 0) {
            setSaveError("请输入文字后再保存。");
            return;
        }
        isSubmittingRef.current = true;
        setIsSaving(true);
        setSaveError(null);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$moment$2f$repository$2f$moment$2d$repository$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createMomentAppend"])(momentId, {
                text
            });
            setText("");
            setIsWriting(false);
            setRefreshRevision((current)=>current + 1);
        } catch  {
            setSaveError("追加保存失败，请重试。输入内容仍然保留。");
        } finally{
            isSubmittingRef.current = false;
            setIsSaving(false);
        }
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: "moment-appends",
        "aria-label": "追加内容",
        children: [
            appends.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "append-list",
                children: appends.map((append)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "append-entry",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("time", {
                                dateTime: append.createdAt,
                                children: formatAppendTime(append.createdAt)
                            }, void 0, false, {
                                fileName: "[project]/src/features/moment/components/moment-appends.tsx",
                                lineNumber: 97,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                children: append.text
                            }, void 0, false, {
                                fileName: "[project]/src/features/moment/components/moment-appends.tsx",
                                lineNumber: 98,
                                columnNumber: 15
                            }, this)
                        ]
                    }, append.id, true, {
                        fileName: "[project]/src/features/moment/components/moment-appends.tsx",
                        lineNumber: 96,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/features/moment/components/moment-appends.tsx",
                lineNumber: 94,
                columnNumber: 9
            }, this) : null,
            readError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "append-error",
                role: "status",
                children: readError
            }, void 0, false, {
                fileName: "[project]/src/features/moment/components/moment-appends.tsx",
                lineNumber: 103,
                columnNumber: 20
            }, this) : null,
            isWriting ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "append-editor",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                        "aria-label": "追加文字",
                        autoFocus: true,
                        disabled: isSaving,
                        onChange: (event)=>setText(event.target.value),
                        placeholder: "后来还想补充……",
                        value: text
                    }, void 0, false, {
                        fileName: "[project]/src/features/moment/components/moment-appends.tsx",
                        lineNumber: 106,
                        columnNumber: 11
                    }, this),
                    saveError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "append-error",
                        role: "alert",
                        children: saveError
                    }, void 0, false, {
                        fileName: "[project]/src/features/moment/components/moment-appends.tsx",
                        lineNumber: 114,
                        columnNumber: 24
                    }, this) : null,
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "append-actions",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                disabled: isSaving,
                                type: "button",
                                onClick: cancelWriting,
                                children: "取消"
                            }, void 0, false, {
                                fileName: "[project]/src/features/moment/components/moment-appends.tsx",
                                lineNumber: 116,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                disabled: isSaving,
                                type: "button",
                                onClick: saveAppend,
                                children: isSaving ? "保存中…" : "保存追加"
                            }, void 0, false, {
                                fileName: "[project]/src/features/moment/components/moment-appends.tsx",
                                lineNumber: 117,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/features/moment/components/moment-appends.tsx",
                        lineNumber: 115,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/features/moment/components/moment-appends.tsx",
                lineNumber: 105,
                columnNumber: 9
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                className: "append-trigger",
                type: "button",
                onClick: beginWriting,
                children: "追加"
            }, void 0, false, {
                fileName: "[project]/src/features/moment/components/moment-appends.tsx",
                lineNumber: 123,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/features/moment/components/moment-appends.tsx",
        lineNumber: 92,
        columnNumber: 5
    }, this);
}
_s(MomentAppends, "6mQ2QALbDwA0aqcdh7TLfCltwGk=");
_c = MomentAppends;
var _c;
__turbopack_context__.k.register(_c, "MomentAppends");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/features/moment/components/quick-moment-record.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "QuickMomentRecord",
    ()=>QuickMomentRecord
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$moment$2f$repository$2f$moment$2d$repository$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/moment/repository/moment-repository.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$moment$2f$location$2f$location$2d$provider$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/moment/location/location-provider.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
function QuickMomentRecord({ onSaved }) {
    _s();
    const [isRecording, setIsRecording] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [text, setText] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [pendingImages, setPendingImages] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [isSaving, setIsSaving] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [location, setLocation] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        city: null,
        placeName: null,
        latitude: null,
        longitude: null
    });
    const [isLocating, setIsLocating] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [isEditingPlace, setIsEditingPlace] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const fileInputRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const pendingImagesRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])([]);
    const locationAttemptedRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    const locationRequestRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "QuickMomentRecord.useEffect": ()=>{
            pendingImagesRef.current = pendingImages;
        }
    }["QuickMomentRecord.useEffect"], [
        pendingImages
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "QuickMomentRecord.useEffect": ()=>({
                "QuickMomentRecord.useEffect": ()=>{
                    pendingImagesRef.current.forEach({
                        "QuickMomentRecord.useEffect": ({ previewUrl })=>URL.revokeObjectURL(previewUrl)
                    }["QuickMomentRecord.useEffect"]);
                }
            })["QuickMomentRecord.useEffect"]
    }["QuickMomentRecord.useEffect"], []);
    function clearPendingImages() {
        pendingImagesRef.current.forEach(({ previewUrl })=>URL.revokeObjectURL(previewUrl));
        pendingImagesRef.current = [];
        setPendingImages([]);
    }
    function beginRecording() {
        setError(null);
        setIsRecording(true);
        if (locationAttemptedRef.current) return;
        locationAttemptedRef.current = true;
        const requestId = ++locationRequestRef.current;
        setIsLocating(true);
        void (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$moment$2f$location$2f$location$2d$provider$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["resolveLocation"])().then((resolved)=>{
            if (requestId !== locationRequestRef.current) return;
            setLocation((current)=>({
                    ...resolved,
                    placeName: current.placeName
                }));
        }).finally(()=>{
            if (requestId === locationRequestRef.current) setIsLocating(false);
        });
    }
    function cancelRecording() {
        if (isSaving) return;
        const hasUnsavedContent = text.trim().length > 0 || pendingImages.length > 0;
        if (hasUnsavedContent && !window.confirm("放弃这条尚未保存的记录？")) return;
        setText("");
        clearPendingImages();
        setLocation({
            city: null,
            placeName: null,
            latitude: null,
            longitude: null
        });
        setIsEditingPlace(false);
        setError(null);
        setIsRecording(false);
        locationAttemptedRef.current = false;
        locationRequestRef.current += 1;
    }
    function chooseImages() {
        fileInputRef.current?.click();
    }
    function handleImagesSelected(event) {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        const images = files.filter((file)=>file.type.startsWith("image/"));
        const rejectedCount = files.length - images.length;
        if (rejectedCount > 0) setError("只有图片文件可以添加。");
        if (images.length === 0) return;
        const next = images.map((file)=>({
                file,
                previewUrl: URL.createObjectURL(file)
            }));
        setPendingImages((current)=>[
                ...current,
                ...next
            ]);
    }
    function removeImage(previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPendingImages((current)=>current.filter((image)=>image.previewUrl !== previewUrl));
    }
    async function saveRecording() {
        if (isSaving) return;
        if (text.trim().length === 0) {
            setError("请输入文字后再保存。");
            return;
        }
        setError(null);
        setIsSaving(true);
        try {
            const moment = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$moment$2f$repository$2f$moment$2d$repository$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createMomentWithAttachments"])({
                originalText: text,
                location: {
                    ...location,
                    placeName: location.placeName?.length ? location.placeName : null
                },
                attachments: pendingImages.map(({ file })=>({
                        blob: file,
                        fileName: file.name,
                        mimeType: file.type,
                        size: file.size
                    }))
            });
            clearPendingImages();
            setText("");
            setLocation({
                city: null,
                placeName: null,
                latitude: null,
                longitude: null
            });
            setIsEditingPlace(false);
            setIsRecording(false);
            locationAttemptedRef.current = false;
            locationRequestRef.current += 1;
            onSaved?.(moment);
        } catch  {
            setError("保存失败，请重试。文字和已选图片仍然保留。");
        } finally{
            setIsSaving(false);
        }
    }
    if (!isRecording) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
            className: "quick-record",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                className: "write-button",
                type: "button",
                onClick: beginRecording,
                children: "写点什么"
            }, void 0, false, {
                fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                lineNumber: 139,
                columnNumber: 46
            }, this)
        }, void 0, false, {
            fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
            lineNumber: 139,
            columnNumber: 12
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: "quick-record",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "record-panel",
            "aria-label": "快速记录",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                    "aria-label": "记录内容",
                    autoFocus: true,
                    disabled: isSaving,
                    onChange: (event)=>setText(event.target.value),
                    placeholder: "今天突然想到……",
                    value: text
                }, void 0, false, {
                    fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                    lineNumber: 145,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "location-field",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            "aria-live": "polite",
                            children: isLocating ? "正在获取位置" : location.city ?? ""
                        }, void 0, false, {
                            fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                            lineNumber: 147,
                            columnNumber: 11
                        }, this),
                        isEditingPlace ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                            children: [
                                "具体地点",
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    "aria-label": "具体地点",
                                    disabled: isSaving,
                                    onChange: (event)=>setLocation((current)=>({
                                                ...current,
                                                placeName: event.target.value
                                            })),
                                    placeholder: "例如：公司、咖啡馆",
                                    value: location.placeName ?? ""
                                }, void 0, false, {
                                    fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                                    lineNumber: 151,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                            lineNumber: 149,
                            columnNumber: 13
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            disabled: isSaving,
                            type: "button",
                            onClick: ()=>setIsEditingPlace(true),
                            children: "添加具体地点"
                        }, void 0, false, {
                            fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                            lineNumber: 154,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                    lineNumber: 146,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                    ref: fileInputRef,
                    accept: "image/*",
                    "aria-label": "选择图片",
                    hidden: true,
                    multiple: true,
                    type: "file",
                    onChange: handleImagesSelected
                }, void 0, false, {
                    fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                    lineNumber: 157,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    disabled: isSaving,
                    type: "button",
                    onClick: chooseImages,
                    children: "添加图片"
                }, void 0, false, {
                    fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                    lineNumber: 158,
                    columnNumber: 9
                }, this),
                pendingImages.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "image-previews",
                    "aria-label": "待保存图片",
                    children: pendingImages.map(({ file, previewUrl })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "image-preview",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                    alt: file.name,
                                    src: previewUrl
                                }, void 0, false, {
                                    fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                                    lineNumber: 165,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    "aria-label": `移除 ${file.name}`,
                                    disabled: isSaving,
                                    type: "button",
                                    onClick: ()=>removeImage(previewUrl),
                                    children: "移除"
                                }, void 0, false, {
                                    fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                                    lineNumber: 166,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, previewUrl, true, {
                            fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                            lineNumber: 162,
                            columnNumber: 15
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                    lineNumber: 160,
                    columnNumber: 11
                }, this) : null,
                error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    role: "alert",
                    children: error
                }, void 0, false, {
                    fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                    lineNumber: 171,
                    columnNumber: 18
                }, this) : null,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "record-actions",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            disabled: isSaving,
                            type: "button",
                            onClick: cancelRecording,
                            children: "取消"
                        }, void 0, false, {
                            fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                            lineNumber: 173,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            disabled: isSaving,
                            type: "button",
                            onClick: saveRecording,
                            children: isSaving ? "保存中…" : "保存"
                        }, void 0, false, {
                            fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                            lineNumber: 174,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
                    lineNumber: 172,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
            lineNumber: 144,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/features/moment/components/quick-moment-record.tsx",
        lineNumber: 143,
        columnNumber: 5
    }, this);
}
_s(QuickMomentRecord, "gFPTOrRHBTCAKJRGR6JmQWWV5d8=");
_c = QuickMomentRecord;
var _c;
__turbopack_context__.k.register(_c, "QuickMomentRecord");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/features/moment/components/recent-moments.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "RECENT_MOMENT_LIMIT",
    ()=>RECENT_MOMENT_LIMIT,
    "RecentMoments",
    ()=>RecentMoments
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$attachment$2f$repository$2f$attachment$2d$repository$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/attachment/repository/attachment-repository.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$moment$2f$repository$2f$moment$2d$repository$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/moment/repository/moment-repository.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$moment$2f$components$2f$moment$2d$appends$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/features/moment/components/moment-appends.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
const RECENT_MOMENT_LIMIT = 20;
function localDateKey(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
function startOfLocalDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function dateLabel(timestamp, now) {
    const date = new Date(timestamp);
    const dayDifference = Math.round((startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime()) / 86_400_000);
    if (dayDifference === 0) return "今天";
    if (dayDifference === 1) return "昨天";
    return new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        ...date.getFullYear() === now.getFullYear() ? {} : {
            year: "numeric"
        }
    }).format(date);
}
function locationLabel(moment) {
    if (!moment.location) return null;
    const parts = [
        moment.location.city,
        moment.location.placeName
    ].filter((value)=>value !== null && value.length > 0);
    return parts.length > 0 ? parts.join(" · ") : null;
}
function groupMoments(moments, now) {
    const groups = new Map();
    for (const view of moments){
        const key = localDateKey(view.moment.createdAt);
        const existing = groups.get(key);
        if (existing) {
            existing.moments.push(view);
        } else {
            groups.set(key, {
                key,
                label: dateLabel(view.moment.createdAt, now),
                moments: [
                    view
                ]
            });
        }
    }
    return Array.from(groups.values());
}
async function loadImages(momentId) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$attachment$2f$repository$2f$attachment$2d$repository$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["listMomentAttachments"])(momentId);
}
function RecentMoments({ refreshKey }) {
    _s();
    const [views, setViews] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [isLoading, setIsLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const objectUrlsRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])([]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "RecentMoments.useEffect": ()=>{
            let isCurrent = true;
            let urlsCommitted = false;
            const createdUrls = [];
            function revoke(urls) {
                urls.forEach({
                    "RecentMoments.useEffect.revoke": (url)=>URL.revokeObjectURL(url)
                }["RecentMoments.useEffect.revoke"]);
            }
            async function load() {
                setIsLoading(true);
                setError(null);
                try {
                    const moments = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$moment$2f$repository$2f$moment$2d$repository$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["listRecentMoments"])(RECENT_MOMENT_LIMIT);
                    const attachmentResults = await Promise.allSettled(moments.map({
                        "RecentMoments.useEffect.load": (moment)=>loadImages(moment.id)
                    }["RecentMoments.useEffect.load"]));
                    const nextViews = moments.map({
                        "RecentMoments.useEffect.load.nextViews": (moment, index)=>{
                            const result = attachmentResults[index];
                            if (result.status === "rejected") {
                                return {
                                    moment,
                                    images: [],
                                    attachmentError: true
                                };
                            }
                            const images = result.value.map({
                                "RecentMoments.useEffect.load.nextViews.images": (attachment)=>{
                                    const url = URL.createObjectURL(attachment.blob);
                                    createdUrls.push(url);
                                    return {
                                        attachmentId: attachment.id,
                                        fileName: attachment.fileName,
                                        url
                                    };
                                }
                            }["RecentMoments.useEffect.load.nextViews.images"]);
                            return {
                                moment,
                                images,
                                attachmentError: false
                            };
                        }
                    }["RecentMoments.useEffect.load.nextViews"]);
                    if (!isCurrent) {
                        revoke(createdUrls);
                        createdUrls.length = 0;
                        return;
                    }
                    revoke(objectUrlsRef.current);
                    objectUrlsRef.current = createdUrls;
                    urlsCommitted = true;
                    setViews(nextViews);
                } catch  {
                    if (!isCurrent) return;
                    revoke(objectUrlsRef.current);
                    objectUrlsRef.current = [];
                    setViews([]);
                    setError("最近记录暂时无法读取。");
                } finally{
                    if (isCurrent) setIsLoading(false);
                }
            }
            void load();
            return ({
                "RecentMoments.useEffect": ()=>{
                    isCurrent = false;
                    if (urlsCommitted) {
                        revoke(createdUrls);
                        objectUrlsRef.current = objectUrlsRef.current.filter({
                            "RecentMoments.useEffect": (url)=>!createdUrls.includes(url)
                        }["RecentMoments.useEffect"]);
                    }
                }
            })["RecentMoments.useEffect"];
        }
    }["RecentMoments.useEffect"], [
        refreshKey
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "RecentMoments.useEffect": ()=>({
                "RecentMoments.useEffect": ()=>{
                    objectUrlsRef.current.forEach({
                        "RecentMoments.useEffect": (url)=>URL.revokeObjectURL(url)
                    }["RecentMoments.useEffect"]);
                    objectUrlsRef.current = [];
                }
            })["RecentMoments.useEffect"]
    }["RecentMoments.useEffect"], []);
    const groups = groupMoments(views, new Date());
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: "recent-moments",
        "aria-label": "最近记录",
        "aria-busy": isLoading,
        children: [
            error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "recent-error",
                role: "alert",
                children: error
            }, void 0, false, {
                fileName: "[project]/src/features/moment/components/recent-moments.tsx",
                lineNumber: 180,
                columnNumber: 16
            }, this) : null,
            groups.map((group)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    className: "moment-group",
                    "aria-labelledby": `date-${group.key}`,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                            id: `date-${group.key}`,
                            children: group.label
                        }, void 0, false, {
                            fileName: "[project]/src/features/moment/components/recent-moments.tsx",
                            lineNumber: 183,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "moment-list",
                            children: group.moments.map(({ moment, images, attachmentError })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                                    className: "moment-entry",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("time", {
                                            dateTime: moment.createdAt,
                                            children: [
                                                new Intl.DateTimeFormat("zh-CN", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    hour12: false
                                                }).format(new Date(moment.createdAt)),
                                                locationLabel(moment) ? ` · ${locationLabel(moment)}` : ""
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/features/moment/components/recent-moments.tsx",
                                            lineNumber: 187,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            children: moment.originalText
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/moment/components/recent-moments.tsx",
                                            lineNumber: 195,
                                            columnNumber: 17
                                        }, this),
                                        images.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "moment-images",
                                            "aria-label": `${moment.originalText}的图片`,
                                            children: images.map((image)=>// Object URLs are local-only previews and do not use remote optimization.
                                                // eslint-disable-next-line @next/next/no-img-element
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                                    alt: image.fileName,
                                                    src: image.url
                                                }, image.attachmentId, false, {
                                                    fileName: "[project]/src/features/moment/components/recent-moments.tsx",
                                                    lineNumber: 201,
                                                    columnNumber: 23
                                                }, this))
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/moment/components/recent-moments.tsx",
                                            lineNumber: 197,
                                            columnNumber: 19
                                        }, this) : null,
                                        attachmentError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "attachment-error",
                                            children: "图片暂时无法读取。"
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/moment/components/recent-moments.tsx",
                                            lineNumber: 205,
                                            columnNumber: 36
                                        }, this) : null,
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$features$2f$moment$2f$components$2f$moment$2d$appends$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MomentAppends"], {
                                            momentId: moment.id
                                        }, void 0, false, {
                                            fileName: "[project]/src/features/moment/components/recent-moments.tsx",
                                            lineNumber: 206,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, moment.id, true, {
                                    fileName: "[project]/src/features/moment/components/recent-moments.tsx",
                                    lineNumber: 186,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/src/features/moment/components/recent-moments.tsx",
                            lineNumber: 184,
                            columnNumber: 11
                        }, this)
                    ]
                }, group.key, true, {
                    fileName: "[project]/src/features/moment/components/recent-moments.tsx",
                    lineNumber: 182,
                    columnNumber: 9
                }, this))
        ]
    }, void 0, true, {
        fileName: "[project]/src/features/moment/components/recent-moments.tsx",
        lineNumber: 179,
        columnNumber: 5
    }, this);
}
_s(RecentMoments, "IBujapNYXWEYBSCmxDppsT6c87k=");
_c = RecentMoments;
var _c;
__turbopack_context__.k.register(_c, "RecentMoments");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/features/moment/location/location-provider.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "resolveLocation",
    ()=>resolveLocation
]);
const defaultReverseGeocoder = {
    async getCity ({ latitude, longitude }) {
        const response = await fetch(`/api/location/reverse?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`, {
            headers: {
                Accept: "application/json"
            }
        });
        if (!response.ok) throw new Error("Reverse geocoding failed.");
        const data = await response.json();
        if (!data || typeof data !== "object" || !("city" in data)) return null;
        const city = data.city;
        return typeof city === "string" && city.length > 0 ? city : null;
    }
};
const defaultLocationProvider = {
    getCurrentPosition () {
        return new Promise((resolve, reject)=>{
            if (!navigator.geolocation) {
                reject(new Error("Geolocation is not supported."));
                return;
            }
            navigator.geolocation.getCurrentPosition(({ coords })=>resolve({
                    latitude: coords.latitude,
                    longitude: coords.longitude
                }), (error)=>reject(error), {
                enableHighAccuracy: false,
                maximumAge: 300_000,
                timeout: 8_000
            });
        });
    }
};
async function resolveLocation(locationProvider = defaultLocationProvider, reverseGeocoder = defaultReverseGeocoder) {
    try {
        const coordinates = await locationProvider.getCurrentPosition();
        let city = null;
        try {
            city = await reverseGeocoder.getCity(coordinates);
        } catch  {
        // Coordinates remain useful when the optional network lookup fails.
        }
        return {
            ...coordinates,
            city,
            placeName: null
        };
    } catch  {
        return {
            city: null,
            placeName: null,
            latitude: null,
            longitude: null
        };
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/features/moment/repository/moment-repository.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createMoment",
    ()=>createMoment,
    "createMomentAppend",
    ()=>createMomentAppend,
    "createMomentWithAttachments",
    ()=>createMomentWithAttachments,
    "getMoment",
    ()=>getMoment,
    "listMomentAppends",
    ()=>listMomentAppends,
    "listMoments",
    ()=>listMoments,
    "listRecentMoments",
    ()=>listRecentMoments,
    "restoreMoment",
    ()=>restoreMoment,
    "softDeleteMoment",
    ()=>softDeleteMoment,
    "softDeleteMomentAppend",
    ()=>softDeleteMomentAppend,
    "updateMomentMetadata",
    ()=>updateMomentMetadata
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db/client.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$identity$2f$create$2d$entity$2d$id$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/identity/create-entity-id.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$time$2f$timestamps$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/time/timestamps.ts [app-client] (ecmascript)");
;
;
;
function requireNonEmpty(value, field) {
    if (value.trim().length === 0) {
        throw new Error(`${field} must not be empty.`);
    }
}
function validateTimestamp(value) {
    if (Number.isNaN(Date.parse(value))) {
        throw new Error("createdAt must be a valid ISO 8601 timestamp.");
    }
}
function toAttachment(input, ownerId, createdAt) {
    if (!input.mimeType.startsWith("image/")) {
        throw new Error("Attachment must be an image.");
    }
    return {
        id: input.id ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$identity$2f$create$2d$entity$2d$id$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createEntityId"])(),
        ownerType: "moment",
        ownerId,
        kind: "image",
        blob: input.blob,
        fileName: input.fileName,
        mimeType: input.mimeType,
        size: input.size ?? input.blob.size,
        width: input.width ?? null,
        height: input.height ?? null,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null
    };
}
async function createMoment(input) {
    requireNonEmpty(input.originalText, "originalText");
    const createdAt = input.createdAt ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$time$2f$timestamps$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["nowTimestamp"])();
    validateTimestamp(createdAt);
    const moment = {
        id: input.id ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$identity$2f$create$2d$entity$2d$id$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createEntityId"])(),
        originalText: input.originalText,
        isFavorite: false,
        location: input.location ?? null,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null
    };
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].moments.add(moment);
    return moment;
}
async function getMoment(id) {
    return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].moments.get(id);
}
async function createMomentWithAttachments(input) {
    requireNonEmpty(input.originalText, "originalText");
    const createdAt = input.createdAt ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$time$2f$timestamps$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["nowTimestamp"])();
    validateTimestamp(createdAt);
    const moment = {
        id: input.id ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$identity$2f$create$2d$entity$2d$id$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createEntityId"])(),
        originalText: input.originalText,
        isFavorite: false,
        location: input.location ?? null,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null
    };
    const attachments = input.attachments.map((attachment)=>toAttachment(attachment, moment.id, createdAt));
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].transaction("rw", __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].moments, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].attachments, async ()=>{
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].moments.add(moment);
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].attachments.bulkAdd(attachments);
    });
    return moment;
}
async function listMoments(options = {}) {
    const moments = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].moments.toArray();
    moments.sort((left, right)=>right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    return options.includeDeleted ? moments : moments.filter((moment)=>moment.deletedAt === null);
}
async function listRecentMoments(limit) {
    if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error("limit must be a positive integer.");
    }
    const recent = [];
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].moments.orderBy("createdAt").reverse().each((moment)=>{
        if (moment.deletedAt === null) {
            recent.push(moment);
        }
        if (recent.length === limit) {
            return false;
        }
    });
    return recent;
}
async function updateMomentMetadata(id, input) {
    const moment = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].moments.get(id);
    if (!moment) {
        throw new Error(`Moment not found: ${id}`);
    }
    const updated = {
        ...moment,
        ...input.isFavorite === undefined ? {} : {
            isFavorite: input.isFavorite
        },
        ...input.location === undefined ? {} : {
            location: input.location
        },
        updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$time$2f$timestamps$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["nowTimestamp"])()
    };
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].moments.put(updated);
    return updated;
}
async function softDeleteMoment(id, deletedAt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$time$2f$timestamps$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["nowTimestamp"])()) {
    validateTimestamp(deletedAt);
    const moment = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].moments.get(id);
    if (!moment) {
        throw new Error(`Moment not found: ${id}`);
    }
    const deleted = {
        ...moment,
        deletedAt,
        updatedAt: deletedAt
    };
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].transaction("rw", __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].moments, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].momentAppends, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].attachments, async ()=>{
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].moments.put(deleted);
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].momentAppends.where("momentId").equals(id).modify({
            deletedAt,
            updatedAt: deletedAt
        });
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].attachments.where("[ownerType+ownerId]").equals([
            "moment",
            id
        ]).modify({
            deletedAt,
            updatedAt: deletedAt
        });
    });
    return deleted;
}
async function restoreMoment(id) {
    const moment = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].moments.get(id);
    if (!moment) {
        throw new Error(`Moment not found: ${id}`);
    }
    const restored = {
        ...moment,
        deletedAt: null,
        updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$time$2f$timestamps$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["nowTimestamp"])()
    };
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].transaction("rw", __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].moments, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].momentAppends, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].attachments, async ()=>{
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].moments.put(restored);
        if (moment.deletedAt !== null) {
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].momentAppends.where("momentId").equals(id).filter((append)=>append.deletedAt === moment.deletedAt).modify({
                deletedAt: null,
                updatedAt: restored.updatedAt
            });
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].attachments.where("[ownerType+ownerId]").equals([
                "moment",
                id
            ]).filter((attachment)=>attachment.deletedAt === moment.deletedAt).modify({
                deletedAt: null,
                updatedAt: restored.updatedAt
            });
        }
    });
    return restored;
}
async function createMomentAppend(momentId, input) {
    requireNonEmpty(input.text, "text");
    const moment = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].moments.get(momentId);
    if (!moment || moment.deletedAt !== null) {
        throw new Error(`Cannot append to missing or deleted Moment: ${momentId}`);
    }
    const createdAt = input.createdAt ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$time$2f$timestamps$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["nowTimestamp"])();
    validateTimestamp(createdAt);
    const append = {
        id: input.id ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$identity$2f$create$2d$entity$2d$id$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createEntityId"])(),
        momentId,
        text: input.text,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null
    };
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].momentAppends.add(append);
    return append;
}
async function listMomentAppends(momentId, options = {}) {
    const appends = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].momentAppends.where("momentId").equals(momentId).toArray();
    const visible = options.includeDeleted ? appends : appends.filter((append)=>append.deletedAt === null);
    visible.sort((left, right)=>left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    return visible;
}
async function softDeleteMomentAppend(id, deletedAt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$time$2f$timestamps$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["nowTimestamp"])()) {
    validateTimestamp(deletedAt);
    const append = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].momentAppends.get(id);
    if (!append) {
        throw new Error(`MomentAppend not found: ${id}`);
    }
    const deleted = {
        ...append,
        deletedAt,
        updatedAt: deletedAt
    };
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["db"].momentAppends.put(deleted);
    return deleted;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/db/client.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LifeDatabase",
    ()=>LifeDatabase,
    "db",
    ()=>db
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$dexie$2f$import$2d$wrapper$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/dexie/import-wrapper.mjs [app-client] (ecmascript)");
;
class LifeDatabase extends __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$dexie$2f$import$2d$wrapper$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"] {
    moments;
    momentAppends;
    attachments;
    diaries;
    constructor(name = "life"){
        super(name);
        this.version(1).stores({});
        this.version(2).stores({
            moments: "id, createdAt, updatedAt, deletedAt, isFavorite",
            momentAppends: "id, momentId, createdAt, updatedAt, deletedAt"
        });
        this.version(3).stores({
            moments: "id, createdAt, updatedAt, deletedAt, isFavorite",
            momentAppends: "id, momentId, createdAt, updatedAt, deletedAt",
            attachments: "id, [ownerType+ownerId], ownerId, createdAt, updatedAt, deletedAt"
        });
        this.version(4).stores({
            moments: "id, createdAt, updatedAt, deletedAt, isFavorite",
            momentAppends: "id, momentId, createdAt, updatedAt, deletedAt",
            attachments: "id, [ownerType+ownerId], ownerId, createdAt, updatedAt, deletedAt",
            diaries: "id, createdAt, updatedAt, deletedAt, isFavorite"
        });
    }
}
const db = new LifeDatabase();
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/identity/create-entity-id.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createEntityId",
    ()=>createEntityId
]);
function createEntityId() {
    return crypto.randomUUID();
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/time/timestamps.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "assertTimestamp",
    ()=>assertTimestamp,
    "nowTimestamp",
    ()=>nowTimestamp
]);
function nowTimestamp() {
    return new Date().toISOString();
}
function assertTimestamp(value) {
    if (Number.isNaN(Date.parse(value))) {
        throw new Error("Timestamp must be a valid ISO 8601 value.");
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_05t_1ad._.js.map
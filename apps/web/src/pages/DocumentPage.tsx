import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { DocEvent } from '@docket/core';
import { api, useAuthedImage, useDocEvents, type Doc } from '../api';
import { isProcessing } from '../format';
import Pipeline from './Pipeline';
import Review from './Review';

export default function DocumentPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const sawPipeline = useRef(false);
  const image = useAuthedImage(doc?.width ? `/documents/${id}/image` : null);

  const load = useCallback(() => api<Doc>(`/documents/${id}`).then(setDoc).catch((e) => setError(e.message)), [id]);
  useEffect(() => { setDoc(null); setShowReview(false); sawPipeline.current = false; void load(); }, [load]);

  useDocEvents(useCallback((e: DocEvent) => {
    if (e.documentId !== id) return;
    // Progress ticks update in place; stage changes reload the stage timings.
    if (e.progress != null && e.stage === 'ocr') setDoc((d) => (d ? { ...d, status: 'READING', ocrProgress: e.progress! } : d));
    else void load();
  }, [id, load]));

  useEffect(() => {
    if (!doc) return;
    if (isProcessing(doc.status) || doc.status === 'FAILED') { sawPipeline.current = true; setShowReview(false); return; }
    // Arrived on a finished document: go straight to review. Watched it being read: stay on the
    // finished pipeline (with its timings) until the reviewer opens the review.
    if (!sawPipeline.current) setShowReview(true);
  }, [doc]);

  if (error) return (
    <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
      <h1 className="font-serif text-2xl">This document could not be opened</h1>
      <p className="mt-2 text-muted">{error}</p>
      <Link to="/documents" className="btn-line mt-6">Back to documents</Link>
    </div>
  );
  if (!doc) return (
    <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-12" role="status" aria-label="Loading document">
      <div className="skeleton mx-auto aspect-[1240/1754] w-full max-w-[620px]" /><div className="space-y-3"><div className="skeleton h-4 w-40" /><div className="skeleton h-9 w-72" /><div className="skeleton h-48" /></div>
    </div>
  );
  return showReview ? <Review doc={doc} image={image} onChange={setDoc} /> : <Pipeline doc={doc} image={image} onOpenReview={() => setShowReview(true)} />;
}

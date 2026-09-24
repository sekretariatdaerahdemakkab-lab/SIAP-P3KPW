'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  RotateCw,
  AlertCircle,
  Maximize2
} from 'lucide-react';
import {
  isPdf,
  isImage,
  getSafeBlobUrl,
  openDocumentInNewTab,
  downloadDocument
} from '@/lib/document-utils';

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentUrl: string | null;
  documentTitle?: string;
  fileName?: string;
}

export default function DocumentViewerModal({
  isOpen,
  onClose,
  documentUrl,
  documentTitle = 'Dokumen Bukti Dukung',
  fileName = 'Dokumen_Lampiran'
}: DocumentViewerModalProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);

  // Derive whether it is PDF or Image
  const docIsPdf = useMemo(() => isPdf(documentUrl, fileName), [documentUrl, fileName]);
  const docIsImage = useMemo(() => isImage(documentUrl, fileName), [documentUrl, fileName]);

  // Convert Data URI to safe Blob URL to prevent browser data: URI navigation blocks
  const safeBlobData = useMemo(() => {
    if (!isOpen || !documentUrl) return { blobUrl: '', revoke: () => {} };
    return getSafeBlobUrl(documentUrl);
  }, [isOpen, documentUrl]);

  useEffect(() => {
    return () => {
      safeBlobData.revoke();
    };
  }, [safeBlobData]);

  const safeUrl = safeBlobData.blobUrl;

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !documentUrl) return null;

  const handleDownload = () => {
    downloadDocument(documentUrl, fileName);
  };

  const handleOpenNewTab = () => {
    openDocumentInNewTab(documentUrl, fileName);
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] text-slate-100 animate-in zoom-in-95 duration-150">
        {/* Pinned Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                docIsPdf
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              }`}
            >
              {docIsPdf ? <FileText className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-xs sm:text-sm text-white truncate">
                  {documentTitle}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    docIsPdf
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                      : 'bg-blue-950/80 text-blue-300 border border-blue-800'
                  }`}
                >
                  {docIsPdf ? 'DOKUMEN PDF' : 'GAMBAR'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate max-w-xs sm:max-w-md mt-0.5">
                {fileName}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Image zoom controls */}
            {docIsImage && (
              <div className="hidden sm:flex items-center gap-1 mr-2 px-2 py-1 bg-slate-800/80 rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => setZoom((prev) => Math.max(0.5, prev - 0.25))}
                  className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
                  title="Perkecil"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono px-1 text-slate-300">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((prev) => Math.min(3, prev + 0.25))}
                  className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
                  title="Perbesar"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((prev) => (prev + 90) % 360)}
                  className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors ml-1 border-l border-slate-700 pl-1.5"
                  title="Putar 90°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleOpenNewTab}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
              title="Buka di Tab Baru (Aman dari halaman kosong)"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tab Baru</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm shadow-blue-950"
              title="Unduh Berkas ke Komputer / HP"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Unduh</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
              title="Tutup Pratinjau (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Document Content Body */}
        <div className="flex-1 overflow-auto bg-slate-950/60 p-2 sm:p-4 flex items-center justify-center min-h-[50vh] sm:min-h-[65vh]">
          {docIsPdf ? (
            <div className="w-full h-[65vh] sm:h-[72vh] rounded-xl overflow-hidden border border-slate-800 bg-slate-900 flex flex-col">
              <iframe
                src={`${safeUrl}#toolbar=1&navpanes=0`}
                title={fileName}
                className="w-full h-full border-0 bg-white"
              />
            </div>
          ) : docIsImage ? (
            <div className="w-full flex items-center justify-center overflow-auto p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={safeUrl || documentUrl}
                alt={fileName}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.15s ease-out'
                }}
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-2xl"
              />
            </div>
          ) : (
            <div className="p-8 text-center max-w-md bg-slate-900 border border-slate-800 rounded-2xl">
              <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
              <h4 className="font-bold text-white text-sm mb-1">
                Format Berkas Tidak Dapat Ditampilkan Langsung
              </h4>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Berkas tidak berformat standar gambar atau PDF, namun berkas tetap aman tersimpan di database.
              </p>
              <button
                type="button"
                onClick={handleDownload}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                Unduh Berkas Lampiran
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer info */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span>
            Tekan <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300 font-mono text-[10px]">ESC</kbd> untuk menutup
          </span>
          <span className="text-emerald-400 flex items-center gap-1 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Dokumen terverifikasi aman
          </span>
        </div>
      </div>
    </div>
  );
}

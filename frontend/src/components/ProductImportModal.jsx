import React, { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FiUploadCloud, FiAlertTriangle, FiFile } from 'react-icons/fi'
import { previewProductImport, commitProductImport } from '../api/products'

/**
 * Import products from a file.
 *
 * Two steps on purpose. Reading the file writes nothing — every row is shown
 * on screen first, editable, with anything doubtful flagged. An import that
 * quietly gets a cost price wrong is worse than no import at all, because the
 * damage only surfaces weeks later in the profit figures.
 */
export default function ProductImportModal({ onClose, onImported }) {
  const fileRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState(null)
  const [warnings, setWarnings] = useState([])

  const preview = useMutation({
    mutationFn: previewProductImport,
    onSuccess: (res) => {
      // The axios response interceptor already unwraps { success, data }, so
      // the payload is res.data. The nested read is kept as a fallback in case
      // an error envelope comes through unwrapped.
      const data = res.data?.rows ? res.data : (res.data?.data || {})
      setRows((data.rows || []).map((r, i) => ({ ...r, key: `${i}-${r.name}` })))
      setWarnings(data.warnings || [])
      if (!data.rows?.length) toast.error('No product rows were found in that file.')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not read that file.'),
  })

  const commit = useMutation({
    mutationFn: commitProductImport,
    onSuccess: (res) => {
      const d = res.data?.created !== undefined ? res.data : (res.data?.data || {})
      toast.success(
        `${d.created || 0} product(s) imported.`
        + (d.skipped ? ` ${d.skipped} skipped.` : '')
        + (d.failed ? ` ${d.failed} failed.` : '')
      )
      if (d.categoriesCreated?.length) {
        toast.success(`New categories created: ${d.categoriesCreated.join(', ')}`, { duration: 6000 })
      }
      onImported?.()
      onClose?.()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Import failed.'),
  })

  const pick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setRows(null)
    preview.mutate(file)
  }

  const update = (key, field, value) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, [field]: value } : r)))

  const toggle = (key) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, include: !r.include } : r)))

  const selected = (rows || []).filter(r => r.include && String(r.name).trim())

  const doImport = () => {
    if (selected.length === 0) return toast.error('Tick at least one row to import.')
    commit.mutate(selected.map(r => ({
      name: r.name,
      category: r.category,
      supplier: r.supplier,
      barcode: r.barcode,
      cost_price: r.cost_price,
      selling_price: r.selling_price,
      quantity: r.quantity,
    })))
  }

  return (
    <div className="p-5 space-y-4">
      {/* ── Step 1: choose a file ─────────────────────────────────────────── */}
      {!rows && (
        <>
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/40 transition-colors"
          >
            <FiUploadCloud className="mx-auto text-orange-400 mb-2" size={32} />
            <p className="text-sm font-semibold text-gray-700">
              {preview.isPending ? 'Reading the file…' : 'Choose a file'}
            </p>
            <p className="text-xs text-gray-400 mt-1">CSV, Excel or PDF — up to 5MB</p>
            {fileName && (
              <p className="mt-2 text-xs text-gray-500 flex items-center justify-center gap-1">
                <FiFile size={12} /> {fileName}
              </p>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.pdf,.txt"
            onChange={pick}
            className="hidden"
          />

          <div className="text-xs text-gray-500 space-y-1.5">
            <p className="font-semibold text-gray-700">The file needs a heading row.</p>
            <p>
              Recognised headings: <span className="font-mono">ProductName</span>,{' '}
              <span className="font-mono">CategoryName</span>,{' '}
              <span className="font-mono">SupplierName</span>,{' '}
              <span className="font-mono">SellingPrice</span>,{' '}
              <span className="font-mono">CostPrice</span>,{' '}
              <span className="font-mono">Quantity</span>. Common variants like Price, Cost
              and Qty work too. Currency symbols and commas are stripped.
            </p>
            <p className="text-amber-700">
              A PDF works only if it holds real text. A scan or a photo of a printed page is
              just a picture — retype it into a spreadsheet instead.
            </p>
          </div>
        </>
      )}

      {/* ── Step 2: check what was found ──────────────────────────────────── */}
      {rows && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-700">
              <span className="font-bold">{rows.length}</span> row(s) read from{' '}
              <span className="font-semibold">{fileName}</span> —{' '}
              <span className="font-bold text-orange-600">{selected.length}</span> ticked to import
            </p>
            <button
              onClick={() => { setRows(null); setFileName('') }}
              className="text-xs font-semibold text-gray-500 hover:text-gray-700"
            >
              Choose another file
            </button>
          </div>

          {warnings.length > 0 && (
            <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <FiAlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={16} />
              <div className="text-xs text-amber-800 space-y-0.5">
                {warnings.map((w, i) => <p key={i}>{w}</p>)}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500">
            Check every row before importing — anything you correct here is what gets saved.
            Rows already in the catalogue are unticked.
          </p>

          <div className="border border-gray-200 rounded-xl overflow-x-auto max-h-[45vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-2 py-2 w-8" />
                  <th className="px-2 py-2 text-left font-bold text-gray-600">Product</th>
                  <th className="px-2 py-2 text-left font-bold text-gray-600">Category</th>
                  <th className="px-2 py-2 text-right font-bold text-gray-600">Cost</th>
                  <th className="px-2 py-2 text-right font-bold text-gray-600">Selling</th>
                  <th className="px-2 py-2 text-right font-bold text-gray-600">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.key} className={r.issues?.length ? 'bg-amber-50/50' : ''}>
                    <td className="px-2 py-1.5 align-top">
                      <input
                        type="checkbox"
                        checked={!!r.include}
                        onChange={() => toggle(r.key)}
                        className="accent-orange-500 mt-1.5"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={r.name || ''}
                        onChange={e => update(r.key, 'name', e.target.value)}
                        className="w-full min-w-[150px] px-1.5 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                      {r.issues?.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-amber-700">{r.issues.join(' · ')}</p>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={r.category || ''}
                        onChange={e => update(r.key, 'category', e.target.value)}
                        className="w-full min-w-[90px] px-1.5 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </td>
                    {['cost_price', 'selling_price', 'quantity'].map(f => (
                      <td key={f} className="px-2 py-1.5">
                        <input
                          type="number"
                          step={f === 'quantity' ? '1' : '0.01'}
                          value={r[f] ?? ''}
                          onChange={e => update(r.key, f, e.target.value === '' ? null : Number(e.target.value))}
                          className={`w-20 px-1.5 py-1 border rounded text-right focus:outline-none focus:ring-1 focus:ring-orange-500 ${
                            r[f] === null ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                          }`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400">
            Categories and suppliers named in the file are created automatically if they do
            not exist yet.
          </p>

          <button
            onClick={doImport}
            disabled={commit.isPending || selected.length === 0}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors"
          >
            {commit.isPending ? 'Importing…' : `Import ${selected.length} product(s)`}
          </button>
        </>
      )}
    </div>
  )
}

import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import CameraCapture from '../../components/CameraCapture'
import LoadingSpinner from '../../components/LoadingSpinner'
import toast from 'react-hot-toast'
import { addDays, addWeeks, addMonths, format } from 'date-fns'

const GHANA_REGIONS = {
  "Ahafo": ["Asunafo North","Asunafo South","Asutifi North","Asutifi South","Tano North","Tano South"],
  "Ashanti": ["Kumasi","Obuasi","Ejisu","Mampong","Bekwai","Asokore Mampong","Suame","Oforikrom","Kwabre East","Atwima Nwabiagya","Atwima Kwanwoma","Bosomtwe","Sekyere East","Sekyere South","Amansie Central","Amansie West","Adansi North","Adansi South","Asante Akim Central","Asante Akim North","Asante Akim South"],
  "Bono East": ["Techiman","Kintampo North","Kintampo South","Atebubu-Amantin","Nkoranza North","Nkoranza South","Pru East","Pru West","Sene East","Sene West"],
  "Bono": ["Sunyani","Berekum East","Berekum West","Dormaa Central","Dormaa East","Dormaa West","Jaman North","Jaman South","Tain","Wenchi"],
  "Central": ["Cape Coast","Kasoa","Winneba","Elmina","Awutu Senya East","Awutu Senya West","Mfantsiman","Agona East","Agona West","Assin Central","Assin Fosu","Assin North","Gomoa East","Gomoa West","Komenda-Edina-Eguafo-Abirem","Twifo Ati-Morkwa"],
  "Eastern": ["Koforidua","Nkawkaw","Suhum","Nsawam-Adoagyiri","Aburi","Akuapim North","Akuapim South","Birim Central","Birim North","Birim South","Akyemansa","Kwahu West","Kwahu East","Kwahu Afram Plains North","Kwahu Afram Plains South","Atiwa East","Atiwa West","Fanteakwa North","Fanteakwa South","Lower Manya Krobo","Upper Manya Krobo","Yilo Krobo"],
  "Greater Accra": ["Accra Metropolitan","Tema Metropolitan","Adenta","Ashaiman","Madina","Ga East","Ga West","Ga South","Ga Central","Ablekuma Central","Ablekuma North","Ablekuma West","Ayawaso Central","Ayawaso East","Ayawaso North","Ayawaso West Wuogon","Korle Klottey","Kpone Katamanso","Ningo-Prampram","Shai-Osudoku","Ledzokuku","Weija-Gbawe"],
  "North East": ["Nalerigu-Gambaga","Walewale","Bunkpurugu-Nakpayili","Chereponi","Yunyoo-Nasuan","East Mamprusi"],
  "Northern": ["Tamale Metropolitan","Sagnarigu","Yendi","Tolon","Kumbungu","Mion","Nanton","Savelugu","Karaga","Gushegu","Nanumba North","Nanumba South","Zabzugu","Tatale-Sanguli"],
  "Oti": ["Dambai","Jasikan","Kadjebi","Krachi East","Krachi West","Krachi Nchumuru","Nkwanta North","Nkwanta South"],
  "Savannah": ["Damongo","Salaga South","Salaga North","Bole","Sawla-Tuna-Kalba","West Gonja","Central Gonja","North Gonja","East Gonja"],
  "Upper East": ["Bolgatanga Municipal","Bawku Municipal","Navrongo","Pusiga","Talensi","Bongo","Kassena-Nankana West","Kassena-Nankana East","Garu","Tempane","Binduri","Builsa North","Builsa South"],
  "Upper West": ["Wa Municipal","Lawra","Nandom","Jirapa","Sissala East","Sissala West","Lambussie-Karni","Nadowli-Kaleo","Daffiama-Bussie-Issa"],
  "Volta": ["Ho Municipal","Hohoe","Keta Municipal","Kpando","Akatsi North","Akatsi South","North Tongu","South Tongu","Central Tongu","Afadzato South","Biakoye","Have","Adaklu","Agotime-Ziope","Ho West"],
  "Western North": ["Sefwi Wiawso","Bibiani-Anhwiaso-Bekwai","Juaboso","Aowin","Bodi","Akontombra","Suaman"],
  "Western": ["Sekondi-Takoradi Metropolitan","Tarkwa-Nsuaem","Shama","Ahanta West","Ellembelle","Nzema East","Effia-Kwesimintsim","Mpohor","Prestea-Huni Valley","Wassa Amenfi Central","Wassa Amenfi East","Wassa Amenfi West","Wassa East"],
}

const IPHONE_MODELS = [
  { model: "iPhone 14", price: 8500 },
  { model: "iPhone 14 Pro", price: 11000 },
  { model: "iPhone 14 Pro Max", price: 12500 },
  { model: "iPhone 15", price: 10500 },
  { model: "iPhone 15 Pro", price: 14000 },
  { model: "iPhone 15 Pro Max", price: 16000 },
  { model: "iPhone 16", price: 18000 },
]

const STEPS = ['Personal Info', 'Photos', 'Address & Income', 'Device & Plan']

const initForm = {
  // Step 1
  full_name: '', email: '', phone: '', ghana_card_id: '', password: '', confirm_password: '',
  // Step 2 - photos
  ghana_card_front: null, ghana_card_back: null, customer_photo: null, guarantor_photo: null, proof_of_income: null,
  // Step 3
  occupation: '', income_amount: '', income_source: '',
  region: '', district: '', location: '', landmark: '', gps_address: '',
  guarantor_name: '', guarantor_phone: '', guarantor_ghana_card_id: '', guarantor_relationship: '',
  // Step 4
  device_model: '', device_price: '', down_payment: '', payment_frequency: 'monthly',
}

export default function StaffAddCustomer() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(initForm)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))
  const districts = form.region ? (GHANA_REGIONS[form.region] || []) : []

  // Payment preview calculations
  const preview = useMemo(() => {
    const price = Number(form.device_price) || 0
    const down = Number(form.down_payment) || 0
    const remaining = Math.max(0, price - down)
    const freq = form.payment_frequency

    let installmentAmount = 0
    let numPayments = 0
    let firstDueDate = null
    let finalDate = null

    if (price > 0 && remaining > 0) {
      if (freq === 'daily') {
        numPayments = 90
        installmentAmount = remaining / numPayments
        firstDueDate = addDays(new Date(), 1)
        finalDate = addDays(new Date(), numPayments)
      } else if (freq === 'weekly') {
        numPayments = 13
        installmentAmount = remaining / numPayments
        firstDueDate = addWeeks(new Date(), 1)
        finalDate = addWeeks(new Date(), numPayments)
      } else {
        numPayments = 12
        installmentAmount = remaining / numPayments
        firstDueDate = addMonths(new Date(), 1)
        finalDate = addMonths(new Date(), numPayments)
      }
    }

    return { price, down, remaining, installmentAmount, numPayments, firstDueDate, finalDate }
  }, [form.device_price, form.down_payment, form.payment_frequency])

  const validateStep = (s) => {
    const e = {}
    if (s === 1) {
      if (!form.full_name.trim()) e.full_name = 'Full name is required'
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Valid email required'
      if (!form.phone.trim()) e.phone = 'Phone number is required'
      if (!form.ghana_card_id.trim()) e.ghana_card_id = 'Ghana Card ID is required'
      if (!form.password) e.password = 'Password is required'
      if (form.password.length > 5) e.password = 'Password must be 5 characters or less'
      if (form.password !== form.confirm_password) e.confirm_password = 'Passwords do not match'
    }
    if (s === 2) {
      if (!form.ghana_card_front) e.ghana_card_front = 'Ghana Card front photo is required'
      if (!form.ghana_card_back) e.ghana_card_back = 'Ghana Card back photo is required'
    }
    if (s === 3) {
      if (!form.occupation.trim()) e.occupation = 'Occupation is required'
      if (!form.region) e.region = 'Region is required'
      if (!form.location.trim()) e.location = 'Location/Town is required'
    }
    if (s === 4) {
      if (!form.device_model) e.device_model = 'Select a device model'
      if (!form.down_payment || Number(form.down_payment) <= 0) e.down_payment = 'Down payment required'
      if (Number(form.down_payment) >= Number(form.device_price)) {
        e.down_payment = 'Down payment must be less than device price'
      }
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const nextStep = () => {
    if (validateStep(step)) setStep(s => Math.min(4, s + 1))
    else {
      const firstErr = document.querySelector('[data-error]')
      firstErr?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
  const prevStep = () => setStep(s => Math.max(1, s - 1))

  const handleSubmit = async () => {
    if (!validateStep(4)) return
    setSubmitting(true)
    try {
      const payload = {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        ghana_card_id: form.ghana_card_id,
        password: form.password,
        ghana_card_front: form.ghana_card_front,
        ghana_card_back: form.ghana_card_back,
        customer_photo: form.customer_photo,
        guarantor_photo: form.guarantor_photo,
        proof_of_income: form.proof_of_income,
        occupation: form.occupation,
        income_amount: form.income_amount,
        income_source: form.income_source,
        region: form.region,
        district: form.district,
        location: form.location,
        landmark: form.landmark,
        gps_address: form.gps_address,
        guarantor_name: form.guarantor_name,
        guarantor_phone: form.guarantor_phone,
        guarantor_ghana_card_id: form.guarantor_ghana_card_id,
        guarantor_relationship: form.guarantor_relationship,
        device_model: form.device_model,
        device_price: Number(form.device_price),
        down_payment: Number(form.down_payment),
        payment_frequency: form.payment_frequency,
      }
      const res = await api.post('/staff/customers', payload)
      toast.success('Customer registered successfully!')
      navigate(`/staff/customers/${res.data?.customer?.id || res.data?.id}`)
    } catch (err) {
      const msg = err?.response?.data?.error || 'Registration failed. Please try again.'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-28 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-black text-gray-900">Register Customer</h1>
          <p className="text-xs text-gray-500">Step {step} of 4: {STEPS[step - 1]}</p>
        </div>
      </div>

      {/* Step Progress */}
      <div className="flex gap-1.5 mb-6">
        {STEPS.map((label, idx) => (
          <div key={label} className="flex-1">
            <div className={`h-1.5 rounded-full transition-all duration-300 ${idx + 1 <= step ? 'bg-green-600' : 'bg-gray-200'}`} />
          </div>
        ))}
      </div>

      {/* STEP 1: Personal Info */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-gray-800">Personal Information</h2>

          <FormField label="Full Name" required error={errors.full_name}>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
              placeholder="Customer's full name"
              className={inputClass(errors.full_name)}
              autoCapitalize="words"
            />
          </FormField>

          <FormField label="Email Address" required error={errors.email}>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="customer@example.com"
              className={inputClass(errors.email)}
              inputMode="email"
              autoCapitalize="none"
            />
          </FormField>

          <FormField label="Phone Number" required error={errors.phone}>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="0244000000"
              className={inputClass(errors.phone)}
              inputMode="tel"
            />
          </FormField>

          <FormField label="Ghana Card ID" required error={errors.ghana_card_id}>
            <input
              type="text"
              value={form.ghana_card_id}
              onChange={(e) => set('ghana_card_id', e.target.value.toUpperCase())}
              placeholder="GHA-000000000-0"
              className={inputClass(errors.ghana_card_id)}
              autoCapitalize="characters"
            />
          </FormField>

          <FormField
            label={`Password (max 5 characters)`}
            required
            error={errors.password}
          >
            <div className="relative">
              <input
                type="text"
                value={form.password}
                onChange={(e) => set('password', e.target.value.slice(0, 5))}
                placeholder="5-char password"
                maxLength={5}
                className={inputClass(errors.password) + ' pr-16'}
              />
              <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold ${form.password.length === 5 ? 'text-green-600' : 'text-gray-400'}`}>
                {form.password.length}/5
              </span>
            </div>
          </FormField>

          <FormField label="Confirm Password" required error={errors.confirm_password}>
            <input
              type="text"
              value={form.confirm_password}
              onChange={(e) => set('confirm_password', e.target.value.slice(0, 5))}
              placeholder="Confirm password"
              maxLength={5}
              className={inputClass(errors.confirm_password)}
            />
          </FormField>
        </div>
      )}

      {/* STEP 2: Photos */}
      {step === 2 && (
        <div className="space-y-5">
          <h2 className="text-base font-bold text-gray-800">Photo Capture</h2>
          <p className="text-sm text-gray-500">Ghana Card photos are required. Please ensure photos are clear and readable.</p>

          <div data-error={errors.ghana_card_front}>
            <CameraCapture
              label="Ghana Card - Front"
              required
              onCapture={(img) => set('ghana_card_front', img)}
            />
            {errors.ghana_card_front && <p className="text-xs text-red-500 mt-1">{errors.ghana_card_front}</p>}
          </div>

          <div data-error={errors.ghana_card_back}>
            <CameraCapture
              label="Ghana Card - Back"
              required
              onCapture={(img) => set('ghana_card_back', img)}
            />
            {errors.ghana_card_back && <p className="text-xs text-red-500 mt-1">{errors.ghana_card_back}</p>}
          </div>

          <CameraCapture
            label="Customer Photo (Optional)"
            onCapture={(img) => set('customer_photo', img)}
          />

          <CameraCapture
            label="Guarantor Photo (Optional)"
            onCapture={(img) => set('guarantor_photo', img)}
          />

          {/* Proof of Income - file upload */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Proof of Income <span className="text-gray-400 font-normal text-xs">(Optional)</span>
            </label>
            {form.proof_of_income ? (
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-2xl border border-green-200">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-green-700">Document uploaded</p>
                </div>
                <button
                  type="button"
                  onClick={() => set('proof_of_income', null)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="w-full h-24 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-green-500 hover:bg-green-50 transition-colors">
                <svg className="w-8 h-8 text-gray-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="text-xs text-gray-500">Upload payslip or bank statement</p>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onloadend = () => set('proof_of_income', reader.result)
                      reader.readAsDataURL(file)
                    }
                  }}
                />
              </label>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: Address & Income */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-gray-800">Address & Income</h2>

          <FormField label="Occupation" required error={errors.occupation}>
            <input
              type="text"
              value={form.occupation}
              onChange={(e) => set('occupation', e.target.value)}
              placeholder="e.g. Teacher, Trader, Engineer"
              className={inputClass(errors.occupation)}
              autoCapitalize="words"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Income Amount (GHS)">
              <input
                type="number"
                value={form.income_amount}
                onChange={(e) => set('income_amount', e.target.value)}
                placeholder="Monthly income"
                className={inputClass()}
                inputMode="numeric"
              />
            </FormField>
            <FormField label="Income Source">
              <input
                type="text"
                value={form.income_source}
                onChange={(e) => set('income_source', e.target.value)}
                placeholder="e.g. Salary"
                className={inputClass()}
              />
            </FormField>
          </div>

          <FormField label="Region" required error={errors.region}>
            <select
              value={form.region}
              onChange={(e) => { set('region', e.target.value); set('district', '') }}
              className={selectClass(errors.region)}
            >
              <option value="">Select Region</option>
              {Object.keys(GHANA_REGIONS).sort().map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </FormField>

          {form.region && (
            <FormField label="District">
              <select
                value={form.district}
                onChange={(e) => set('district', e.target.value)}
                className={selectClass()}
              >
                <option value="">Select District</option>
                {districts.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </FormField>
          )}

          <FormField label="Location / Town" required error={errors.location}>
            <input
              type="text"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="Town or neighborhood"
              className={inputClass(errors.location)}
            />
          </FormField>

          <FormField label="Landmark">
            <input
              type="text"
              value={form.landmark}
              onChange={(e) => set('landmark', e.target.value)}
              placeholder="Near church, school, etc."
              className={inputClass()}
            />
          </FormField>

          <FormField label="GPS Address">
            <input
              type="text"
              value={form.gps_address}
              onChange={(e) => set('gps_address', e.target.value)}
              placeholder="GH-123-456"
              className={inputClass()}
            />
          </FormField>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Guarantor Information</h3>

            <div className="space-y-3">
              <FormField label="Guarantor Full Name">
                <input
                  type="text"
                  value={form.guarantor_name}
                  onChange={(e) => set('guarantor_name', e.target.value)}
                  placeholder="Guarantor's full name"
                  className={inputClass()}
                  autoCapitalize="words"
                />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Guarantor Phone">
                  <input
                    type="tel"
                    value={form.guarantor_phone}
                    onChange={(e) => set('guarantor_phone', e.target.value)}
                    placeholder="Phone"
                    className={inputClass()}
                  />
                </FormField>
                <FormField label="Relationship">
                  <input
                    type="text"
                    value={form.guarantor_relationship}
                    onChange={(e) => set('guarantor_relationship', e.target.value)}
                    placeholder="e.g. Spouse"
                    className={inputClass()}
                  />
                </FormField>
              </div>
              <FormField label="Guarantor Ghana Card ID">
                <input
                  type="text"
                  value={form.guarantor_ghana_card_id}
                  onChange={(e) => set('guarantor_ghana_card_id', e.target.value.toUpperCase())}
                  placeholder="GHA-000000000-0"
                  className={inputClass()}
                  autoCapitalize="characters"
                />
              </FormField>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: Device & Plan */}
      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-gray-800">Device & Payment Plan</h2>

          <FormField label="iPhone Model" required error={errors.device_model}>
            <select
              value={form.device_model}
              onChange={(e) => {
                const m = IPHONE_MODELS.find(i => i.model === e.target.value)
                set('device_model', e.target.value)
                set('device_price', m ? String(m.price) : '')
              }}
              className={selectClass(errors.device_model)}
            >
              <option value="">Select iPhone Model</option>
              {IPHONE_MODELS.map(m => (
                <option key={m.model} value={m.model}>
                  {m.model} — GHS {m.price.toLocaleString()}
                </option>
              ))}
            </select>
          </FormField>

          {form.device_model && (
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-2xl border border-green-200">
              <svg className="w-8 h-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <div>
                <p className="font-bold text-green-800">{form.device_model}</p>
                <p className="text-sm text-green-600">GHS {Number(form.device_price).toLocaleString()}</p>
              </div>
            </div>
          )}

          <FormField label="Down Payment (GHS)" required error={errors.down_payment}>
            <input
              type="number"
              value={form.down_payment}
              onChange={(e) => set('down_payment', e.target.value)}
              placeholder="Enter down payment amount"
              className={inputClass(errors.down_payment)}
              inputMode="numeric"
              min="0"
              max={form.device_price}
            />
          </FormField>

          <FormField label="Payment Frequency">
            <div className="grid grid-cols-3 gap-2">
              {['daily', 'weekly', 'monthly'].map(freq => (
                <button
                  key={freq}
                  type="button"
                  onClick={() => set('payment_frequency', freq)}
                  className={`py-3 px-2 rounded-2xl border-2 text-sm font-semibold capitalize transition-all
                    ${form.payment_frequency === freq
                      ? 'border-green-600 bg-green-50 text-green-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                >
                  {freq}
                </button>
              ))}
            </div>
          </FormField>

          {/* Payment Preview */}
          {form.device_model && Number(form.down_payment) > 0 && (
            <div className="bg-white rounded-2xl border-2 border-green-200 p-4 space-y-2.5">
              <h3 className="text-sm font-bold text-gray-800 mb-3">Payment Preview</h3>
              <PreviewRow label="Total Price" value={`GHS ${preview.price.toLocaleString()}`} />
              <PreviewRow label="Down Payment" value={`GHS ${preview.down.toLocaleString()}`} />
              <PreviewRow
                label="Remaining Balance"
                value={`GHS ${preview.remaining.toLocaleString()}`}
                highlight
              />
              <div className="border-t border-gray-100 my-1" />
              <PreviewRow
                label={`Installment per ${form.payment_frequency.replace('ly', '')}`}
                value={`GHS ${preview.installmentAmount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                bold
              />
              <PreviewRow label="Number of Payments" value={`${preview.numPayments} payments`} />
              {preview.firstDueDate && (
                <PreviewRow
                  label="First Due Date"
                  value={format(preview.firstDueDate, 'dd MMM yyyy')}
                />
              )}
              {preview.finalDate && (
                <PreviewRow
                  label="Final Payment Date"
                  value={format(preview.finalDate, 'dd MMM yyyy')}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 pb-safe flex gap-3">
        {step > 1 && (
          <button
            type="button"
            onClick={prevStep}
            className="flex-1 py-3.5 border-2 border-gray-200 rounded-2xl text-gray-700 font-bold text-sm hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
        )}
        {step < 4 ? (
          <button
            type="button"
            onClick={nextStep}
            className="flex-1 py-3.5 bg-green-800 text-white font-bold text-sm rounded-2xl hover:bg-green-900 active:scale-95 transition-all"
          >
            Continue →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-3.5 bg-green-800 text-white font-bold text-sm rounded-2xl
                       hover:bg-green-900 disabled:opacity-60 flex items-center justify-center gap-2
                       active:scale-95 transition-all"
          >
            {submitting ? (
              <>
                <LoadingSpinner size="sm" color="white" />
                Registering...
              </>
            ) : (
              'Register Customer ✓'
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function FormField({ label, required, error, children }) {
  return (
    <div data-error={error || undefined}>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

function PreviewRow({ label, value, highlight, bold }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? 'text-red-600' : bold ? 'text-green-800 text-base font-bold' : 'text-gray-800'}`}>
        {value}
      </span>
    </div>
  )
}

const inputClass = (error) =>
  `w-full px-4 py-3 border-2 rounded-2xl text-sm focus:outline-none focus:border-green-600 bg-white min-h-[48px] ${error ? 'border-red-400' : 'border-gray-200'}`

const selectClass = (error) =>
  `w-full px-4 py-3 border-2 rounded-2xl text-sm focus:outline-none focus:border-green-600 bg-white min-h-[48px] ${error ? 'border-red-400' : 'border-gray-200'}`

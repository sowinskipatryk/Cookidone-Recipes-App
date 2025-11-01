import React, { useEffect, useState } from 'react'
import './RecipeList.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function parseTimeToMinutes(t) {
  if (!t) return 0
  const lower = String(t).toLowerCase()
  let minutes = 0
  const hMatch = lower.match(/(\d+)\s*(godz|godz\.|h)\b/)
  if (hMatch) minutes += parseInt(hMatch[1], 10) * 60
  const mMatch = lower.match(/(\d+)\s*min\b/)
  if (mMatch) minutes += parseInt(mMatch[1], 10)
  if (!hMatch && !mMatch) {
    const num = lower.match(/(\d+)/)
    if (num) minutes = parseInt(num[1], 10)
  }
  return minutes
}

export default function RecipeList() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [perPage] = useState(20)
  const [total, setTotal] = useState(0)
  const [sort, setSort] = useState('')
  const [desc, setDesc] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [error, setError] = useState(null)
  const [ratingRange, setRatingRange] = useState([0, 5])
  const [numRatingsRange, setNumRatingsRange] = useState([0, 5000])
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [firstLoad, setFirstLoad] = useState(true)
  const [language, setLanguage] = useState('')
  const [categories, setCategories] = useState([])
  const [allCategories, setAllCategories] = useState([])
  const [catOpen, setCatOpen] = useState(false)
  const [languageFilter, setLanguageFilter] = useState({
    ENG: true,
    PL: true,
  })

  useEffect(() => {
    fetchList(firstLoad)
    if (firstLoad) setFirstLoad(false)
  }, [page, sort, desc])

  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await fetch(`${API}/api/categories`)
        const data = await res.json()
        setAllCategories(data)
      } catch (e) {
        console.error('Failed to load categories:', e)
      }
    }
    loadCategories()
  }, [])


  useEffect(() => {
    if (firstLoad) return
    const delay = setTimeout(() => fetchList(false), 500)
    return () => clearTimeout(delay)
  }, [q, ratingRange, numRatingsRange, language, categories, languageFilter])

  useEffect(() => {
    function handleClickOutside(e) {
      if (!e.target.closest('.dropdown')) setCatOpen(false)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])


  function getSortValue(it, field) {
    if (!field) return 0
    if (field === 'preparationTime' || field === 'totalTime') return parseTimeToMinutes(it[field])
    if (field === 'rating' || field === 'numberOfRatings') return Number(it[field] ?? 0)
    return it[field]
  }

  function changeSort(field) {
    if (sort === field) setDesc(!desc)
    else {
      setSort(field)
      setDesc(false)
    }
  }

  function toggleLanguage(lang) {
    setLanguageFilter(prev => ({
      ...prev,
      [lang]: !prev[lang]
    }))
  }

  async function fetchList(first = false) {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (q) params.set('q', q)
    params.set('page', page)
    params.set('per_page', perPage)
    if (sort) params.set('sort', sort)
    if (desc) params.set('desc', 'true')
    if (first) params.set('first_load', 'true')

    params.set('rating_min', ratingRange[0])
    params.set('rating_max', ratingRange[1])
    params.set('num_ratings_min', numRatingsRange[0])
    params.set('num_ratings_max', numRatingsRange[1])
    params.set('seed', seed)
    const enabledLanguages = Object.entries(languageFilter)
      .filter(([_, enabled]) => enabled)
      .map(([lang]) => lang)

    if (enabledLanguages.length === 1) {
      params.set('language', enabledLanguages[0])
    } else {
      params.delete('language') // send nothing to include both
    }

    if (categories.length > 0) categories.forEach(cat => params.append('categories', cat))

    try {
      if (first || (!sort && !desc)) params.set('randomize', 'true')
        const res = await fetch(`${API}/api/recipes?${params.toString()}`)
      const data = await res.json()
      setItems(data.items)
      setTotal(data.total)
    } catch (e) {
      console.error(e)
      setError('Failed to load recipes.')
    } finally {
      setLoading(false)
    }
  }

  async function openRecipe(id) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/recipes/${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSelectedRecipe(data)
    } catch (e) {
      console.error(e)
      setError('Failed to load recipe details.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="recipe-list-container">
      <form className="search-form">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by title or ingredient" />
        <button type="button" onClick={() => { setQ(''); fetchList(false) }}>Clear</button>
      </form>

      <div className="sort-buttons">
        <label>Sort:</label>
        <button onClick={() => changeSort('rating')}>Rating</button>
        <button onClick={() => changeSort('numberOfRatings')}>NumRatings</button>
        <button onClick={() => changeSort('preparationTime')}>Prep Time</button>
        <button onClick={() => changeSort('totalTime')}>Total Time</button>
      </div>

      <div className="filters">
        <div className="filter">
          <label>Rating: {ratingRange[0]} - {ratingRange[1]}</label>
          <input type="range" min="0" max="5" step="0.1"
            value={ratingRange[0]}
            onChange={e => setRatingRange([Number(e.target.value), ratingRange[1]])} />
          <input type="range" min="0" max="5" step="0.1"
            value={ratingRange[1]}
            onChange={e => setRatingRange([ratingRange[0], Number(e.target.value)])} />
        </div>

        <div className="filter">
          <label>NumRatings: {numRatingsRange[0]} - {numRatingsRange[1]}</label>
          <input type="range" min="0" max="5000" step="1"
            value={numRatingsRange[0]}
            onChange={e => setNumRatingsRange([Number(e.target.value), numRatingsRange[1]])} />
          <input type="range" min="0" max="5000" step="1"
            value={numRatingsRange[1]}
            onChange={e => setNumRatingsRange([numRatingsRange[0], Number(e.target.value)])} />
        </div>

        <div className="filter">
          <label>Language:</label>
          <div className="language-buttons">
            <button
              className={languageFilter.ENG ? "active" : ""}
              onClick={() => toggleLanguage("ENG")}
            >
              English
            </button>

            <button
              className={languageFilter.PL ? "active" : ""}
              onClick={() => toggleLanguage("PL")}
            >
              Polski
            </button>
          </div>
        </div>

        <div className="filter">
          <label>Categories:</label>
          <div className="dropdown">
            <button
              type="button"
              className="dropdown-toggle"
              onClick={() => setCatOpen(o => !o)}
            >
              {categories.length > 0
                ? `${categories.length} selected`
                : 'Select categories'}
            </button>

            {catOpen && (
              <div className="dropdown-menu">
                {allCategories.map(cat => (
                  <label key={cat} className="dropdown-item">
                    <input
                      type="checkbox"
                      checked={categories.includes(cat)}
                      onChange={e => {
                        if (e.target.checked)
                          setCategories(prev => [...prev, cat])
                        else
                          setCategories(prev => prev.filter(c => c !== cat))
                      }}
                    />
                    {cat}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {loading ? <div>Loading...</div> : error ? <div className="error">{error}</div> : (
        <>
          <table className="recipes-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Title</th>
                <th>Rating</th>
                <th>NumRatings</th>
                <th>Prep Time</th>
                <th>Total Time</th>
                <th>Difficulty</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} onClick={() => openRecipe(it.id)} style={{ cursor: 'pointer' }}>
                  <td><img src={`${API}/images/recipes/small/${it.id}.jpeg`} alt="" /></td>
                  <td>{it.title}</td>
                  <td>{it.rating}</td>
                  <td>{it.numberOfRatings}</td>
                  <td>{it.preparationTime}</td>
                  <td>{it.totalTime}</td>
                  <td>
                    {it.difficultyLevel === 1 && '●○○'}
                    {it.difficultyLevel === 2 && '●●○'}
                    {it.difficultyLevel === 3 && '●●●'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pagination">
            <button onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1}>Previous</button>
            <span>Page {page} of {Math.ceil(total / perPage)}</span>
            <button onClick={() => setPage(p => Math.min(p + 1, Math.ceil(total / perPage)))} disabled={page === Math.ceil(total / perPage)}>Next</button>
          </div>
        </>
      )}

      {selectedRecipe && (
        <div className="modal" onClick={() => setSelectedRecipe(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedRecipe(null)}>Close</button>

            <img
              className="recipe-large-img"
              src={`${API}/images/recipes/large/${selectedRecipe.id}.jpeg`}
              alt={selectedRecipe.title}
            />

            <h2>{selectedRecipe.title}</h2>
            <p><strong>Rating:</strong> {selectedRecipe.rating}</p>
            <p><strong>NumRatings:</strong> {selectedRecipe.numberOfRatings}</p>
            <p><strong>Prep Time:</strong> {selectedRecipe.preparationTime}</p>
            <p><strong>Total Time:</strong> {selectedRecipe.totalTime}</p>
            <p><strong>Portions:</strong> {selectedRecipe.numberOfPortions}</p>

            {selectedRecipe.data?.ingredients?.length > 0 && (
              <div>
                <h3>Ingredients:</h3>
                <ul>{selectedRecipe.data.ingredients.map((i, idx) => <li key={idx}>{i}</li>)}</ul>
              </div>
            )}

            {selectedRecipe.data?.recipe?.length > 0 && (
              <div>
                <h3>Steps:</h3>
                <ol>{selectedRecipe.data.recipe.map((s, idx) => <li key={idx}>{s}</li>)}</ol>
              </div>
            )}

            {selectedRecipe.data?.nutrition && (
              <div>
                <h3>Nutrition (per serving):</h3>
                <ul>
                  {Object.entries(selectedRecipe.data.nutrition.values).map(([k,v]) => <li key={k}>{k}: {v}</li>)}
                </ul>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}

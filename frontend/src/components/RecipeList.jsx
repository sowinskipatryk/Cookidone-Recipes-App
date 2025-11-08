import { Range } from 'react-range'
import Select from 'react-select';
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
  const [perPage] = useState(30)
  const [total, setTotal] = useState(0)
  const [sort, setSort] = useState('')
  const [desc, setDesc] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [error, setError] = useState(null)
  const [ratingRange, setRatingRange] = useState([1, 5])
  const [numRatingsRange, setNumRatingsRange] = useState([0, 30000])
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [allIngredients, setAllIngredients] = useState([]);
  const [includeIngredients, setIncludeIngredients] = useState([]);
  const [excludeIngredients, setExcludeIngredients] = useState([]);
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
    async function loadIngredients() {
      try {
        const res = await fetch(`${API}/api/ingredients`);
        if (!res.ok) throw new Error('Failed to load ingredients');
        const data = await res.json();
        setAllIngredients(data);
      } catch (e) {
        console.error('Failed to load ingredients:', e);
        setAllIngredients([]); // fallback
      }
    }
    loadIngredients();
  }, []);

  useEffect(() => {
    if (firstLoad) return
    const delay = setTimeout(() => fetchList(false), 500)
    return () => clearTimeout(delay)
  }, [q, ratingRange, numRatingsRange, language, categories, languageFilter, includeIngredients, excludeIngredients])

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
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", page);
    params.set("per_page", perPage);
    if (sort) params.set("sort", sort);
    if (desc) params.set("desc", "true");
    if (first) params.set("first_load", "true");

    params.set("rating_min", ratingRange[0]);
    params.set("rating_max", ratingRange[1]);
    params.set("num_ratings_min", numRatingsRange[0]);
    params.set("num_ratings_max", numRatingsRange[1]);
    params.set("seed", seed);

    const enabledLanguages = Object.entries(languageFilter)
      .filter(([_, enabled]) => enabled)
      .map(([lang]) => lang);

    if (enabledLanguages.length === 1) {
      params.set("language", enabledLanguages[0]);
    } else {
      params.delete("language"); // send nothing to include all
    }

    // --- Categories ---
    if (categories.length > 0)
      categories.forEach((cat) => params.append("categories", cat));

    // --- ✅ Include Ingredients ---
    if (includeIngredients.length > 0)
      includeIngredients.forEach((id) =>
        params.append("includeIngredients", id)
      );

    // --- ✅ Exclude Ingredients ---
    if (excludeIngredients.length > 0)
      excludeIngredients.forEach((id) =>
        params.append("excludeIngredients", id)
      );

    try {
      if (first || (!sort && !desc)) params.set("randomize", "true");
      const res = await fetch(`${API}/api/recipes?${params.toString()}`);
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      console.error(e);
      setError("Failed to load recipes.");
    } finally {
      setLoading(false);
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

  function formatTime(minutes) {
    if (!minutes || minutes <= 0) return '—'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h > 0 && m > 0) return `${h} h ${m} min`
    if (h > 0) return `${h} h`
    return `${m} min`
  }

  function renderDifficultyDots(level) {
    const colors = ['#4CAF50', '#FFC107', '#F44336'] // green, yellow, red
    const maxDots = 1
    return Array.from({ length: maxDots }, (_, i) => (
      <span
        key={i}
        style={{
          display: 'inline-block',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          marginRight: '3px',
          backgroundColor: i < level ? colors[level - 1] : '#ccc',
        }}
      />
    ))
  }

  return (
    <div className="recipe-list-container">
      <form className="search-form" onSubmit={e => e.preventDefault()}>
        <div className="search-bar">
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="🔍 Search recipes..."
          />
          {q && (
            <button
              type="button"
              className="clear-btn"
              onClick={() => { setQ(''); fetchList(false) }}
            >
              ✕
            </button>
          )}
        </div>
      </form>

      <div className="sort-buttons">
        <label>Sort by:</label>
        {[
          { key: 'rating', label: 'Rating' },
          { key: 'numberOfRatings', label: 'NumRatings' },
          { key: 'preparationTime', label: 'Prep Time' },
          { key: 'totalTime', label: 'Total Time' },
        ].map(opt => (
          <button
            key={opt.key}
            className={
              sort === opt.key ? `active ${desc ? 'desc' : 'asc'}` : ''
            }
            onClick={() => changeSort(opt.key)}
          >
            {opt.label}
            {sort === opt.key && (
              <span className="sort-arrow">{desc ? '↓' : '↑'}</span>
            )}
          </button>
        ))}
      </div>

      <div className="filters">
        <div className="filter">
          <label>Rating:</label>
          <div className="range-wrapper">
            <Range
              step={0.1}
              min={1}
              max={5}
              values={ratingRange}
              onChange={setRatingRange}
              renderTrack={({ props, children }) => (
                <div {...props} className="range-track">{children}</div>
              )}
              renderThumb={({ props, index }) => (
                <div {...props} className="range-thumb" />
              )}
            />
            <div className="range-values">
              <span>{ratingRange[0].toFixed(1)}</span>
              <span>{ratingRange[1].toFixed(1)}</span>
            </div>
          </div>
        </div>

        <div className="filter">
          <label>NumRatings:</label>
          <div className="range-wrapper">
            <Range
              step={1}
              min={0}
              max={30000}
              values={numRatingsRange}
              onChange={setNumRatingsRange}
              renderTrack={({ props, children }) => (
                <div {...props} className="range-track">{children}</div>
              )}
              renderThumb={({ props }) => <div {...props} className="range-thumb" />}
            />
            <div className="range-values">
              <span>{numRatingsRange[0]}</span>
              <span>{numRatingsRange[1]}</span>
            </div>
          </div>
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

        <div className="filters">
          <div className="filter" style={{ minWidth: '250px' }}>
            <label>Include ingredients:</label>
            <Select
              isMulti
              options={allIngredients.map(i => ({ value: i.id, label: i.name }))}
              value={allIngredients
                .filter(i => includeIngredients.includes(i.id))
                .map(i => ({ value: i.id, label: i.name }))}
              onChange={selected => setIncludeIngredients(selected.map(s => s.value))}
              placeholder="Search ingredients to include..."
              classNamePrefix="react-select"
            />
          </div>

          <div className="filter" style={{ minWidth: '250px' }}>
            <label>Exclude ingredients:</label>
            <Select
              isMulti
              options={allIngredients.map(i => ({ value: i.id, label: i.name }))}
              value={allIngredients
                .filter(i => excludeIngredients.includes(i.id))
                .map(i => ({ value: i.id, label: i.name }))}
              onChange={selected => setExcludeIngredients(selected.map(s => s.value))}
              placeholder="Search ingredients to exclude..."
              classNamePrefix="react-select"
            />
          </div>
        </div>
      </div>

      {loading ? <div>Loading...</div> : error ? <div className="error">{error}</div> : (
        <>
          <div className="recipes-grid">
            {items.map(it => (
              <div key={it.id} className="recipe-card" onClick={() => openRecipe(it.id)}>
                <img
                  src={`${API}/images/recipes/small/${it.id}.jpeg`}
                  alt={it.title}
                  className="recipe-image"
                />
                <div className="recipe-info">
                  <h3 className="recipe-title">{it.title}</h3>
                  <div className="recipe-meta">
                    <div className="rating-info">
                      <span className="rating">⭐ {it.rating?.toFixed(1) ?? '–'}</span>
                      <span className="num-ratings">({it.numberOfRatings ?? 0})</span>
                    </div>
                    <span className="total-time">
                      ⏱ {formatTime(it.totalTime)}
                    </span>
                    {/* <span className="difficulty-dots">
                      {renderDifficultyDots(it.difficultyLevel)}
                    </span> */}
                  </div>
                </div>
              </div>
            ))}
          </div>

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

            <div className="modal-top">
              <img
                className="recipe-large-img"
                src={`${API}/images/recipes/large/${selectedRecipe.id}.jpeg`}
                alt={selectedRecipe.title}
              />
              <div className="recipe-details-right">
                <h2>{selectedRecipe.title}</h2>
                <div className="meta-top">
                  <p><strong>Rating:</strong> {selectedRecipe.rating}</p>
                  <p><strong>NumRatings:</strong> {selectedRecipe.numberOfRatings}</p>
                  <p><strong>Prep Time:</strong> {selectedRecipe.preparationTime}</p>
                  <p><strong>Total Time:</strong> {selectedRecipe.totalTime}</p>
                  <p><strong>Portions:</strong> {selectedRecipe.numberOfPortions}</p>
                  <p className="difficulty-level">
                    <strong>Difficulty:</strong> {renderDifficultyDots(selectedRecipe.difficultyLevel ?? 1)}
                  </p>

                </div>
              </div>
            </div>

            {selectedRecipe.data?.ingredients?.length > 0 && (
              <div className="ingredients-section">
                <h3>Ingredients:</h3>
                <ul className="ingredients-list">
                  {selectedRecipe.data.ingredients.map((name, idx) => {
                    const id = selectedRecipe.data.ingredientIds?.[idx];
                    const imgUrl = id ? `${API}/images/ingredients/${id}.png` : null;
                    return (
                      <li key={idx} className="ingredient-item">
                        {imgUrl && <img src={imgUrl} alt={name} onError={e => (e.target.style.display = 'none')} />}
                        <span>{name}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {selectedRecipe.data?.recipe?.length > 0 && (
              <div className="steps-section">
                <h3>Steps:</h3>
                <ol className="steps-list">
                  {selectedRecipe.data.recipe.map((s, idx) => <li key={idx}>{s}</li>)}
                </ol>
              </div>
            )}

            {selectedRecipe.data?.nutrition && (
              <div className="nutrition-section">
                <h3>Nutrition (per serving):</h3>
                <ul>
                  {Object.entries(selectedRecipe.data.nutrition.values).map(([k, v]) => <li key={k}>{k}: {v}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

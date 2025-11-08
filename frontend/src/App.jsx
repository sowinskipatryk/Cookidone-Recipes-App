import React from 'react'
import RecipeList from './components/RecipeList'
import './App.css'

export default function App(){
    return (
    <div className="container">
        <h1>Cookidone</h1>
        <RecipeList />
    </div>
    )
}
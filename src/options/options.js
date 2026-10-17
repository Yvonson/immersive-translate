"use strict";

var $ = document.querySelector.bind(document)

twpConfig.onReady(function () {
    if (platformInfo.isMobile.any) {
        let style = document.createElement("style")
        style.textContent = ".desktopOnly {display: none !important}"
        document.head.appendChild(style)
    }

    let sideBarIsVisible = false
    $("#btnOpenMenu").onclick = e => {
        $("#menuContainer").classList.toggle("change")

        if (sideBarIsVisible) {
            $("#sideBar").style.display = "none"
            sideBarIsVisible = false
        } else {
            $("#sideBar").style.display = "block"
            sideBarIsVisible = true
        }
    }

    function hashchange() {
        const hash = location.hash || "#main"
        const divs = [$("#main"),  $("#translations"),  $("#hotkeys"), $("#storage"), $("#others"), $("#donation"), ]
        divs.forEach(element => {
            element.style.display = "none"
        })

        document.querySelectorAll("nav a").forEach(a => {
            a.classList.remove("w3-light-grey")
        })

        $(hash).style.display = "block"
        $('a[href="' + hash + '"]').classList.add("w3-light-grey")

        let text
        if (hash === "#donation") {
            text = chrome.i18n.getMessage("lblMakeDonation")
        }else {
            text = chrome.i18n.getMessage("lblSettings")
        }
        $("#itemSelectedName").textContent = text

        if (sideBarIsVisible) {
            $("#menuContainer").classList.toggle("change")
            $("#sideBar").style.display = "none"
            sideBarIsVisible = false
        }

        $("#btnPatreon").style.display = "block"
    }
    hashchange()
    window.addEventListener("hashchange", hashchange)

    function fillLanguageList(select) {
        let langs = twpLang.getLanguageList()

        const langsSorted = []

        for (const i in langs) {
            langsSorted.push([i, langs[i]])
        }

        langsSorted.sort(function (a, b) {
            // en should be the first
            if (a[0] === "en") return -1
            if (b[0] === "en") return 1
            // zh-CN and zh-TW should be the second and third
            if (a[0] === "zh-CN") return -1
            if (b[0] === "zh-CN") return 1
            if (a[0] === "zh-TW") return -1
            if (b[0] === "zh-TW") return 1
            return a[1].localeCompare(b[1]);
        })

        langsSorted.forEach(value => {
            const option = document.createElement("option")
            option.value = value[0]
            option.textContent = value[1]
            select.appendChild(option)
        })
    }

    fillLanguageList($("#targetLanguage1"))

    fillLanguageList($("#addToNeverTranslateLangs"))
    fillLanguageList($("#addToAlwaysTranslateLangs"))

  $("#darkMode").onchange = (e) => {
    twpConfig.set("darkMode", e.target.value);
    updateDarkMode();
  };
  $("#darkMode").value = twpConfig.get("darkMode");
    function enableDarkMode() {
        if (!$("#darkModeElement")) {
            const el = document.createElement("style")
            el.setAttribute("id", "darkModeElement")
            el.setAttribute("rel", "stylesheet")
            el.textContent = `
            * {
                scrollbar-color: #202324 #454a4d;
            }

            #donation * {
                background-color: #87CEEB !important;
            }

            #donation select {
                color: black !important;
                background-color: rgb(231, 230, 228) !important;
            }

            html *, nav, #header {
                color: rgb(231, 230, 228) !important;
                background-color: #181a1b !important;
            }
            `
            document.head.appendChild(el)
        }
    }

    function disableDarkMode() {
        if ($("#darkModeElement")) {
            $("#darkModeElement").remove()
        }
    }

    function updateDarkMode() {
        switch (twpConfig.get("darkMode")) {
            case "auto":
                if (matchMedia("(prefers-color-scheme: dark)").matches) {
                    enableDarkMode()
                } else {
                    disableDarkMode()
                }
                break
            case "yes":
                enableDarkMode()
                break
            case "no":
                disableDarkMode()
                break
            default:
                break
        }
    }
    updateDarkMode()


    // target languages

    const targetLanguages = twpConfig.get("targetLanguages")

    $("#targetLanguage1").value = targetLanguages[0]

    $("#targetLanguage1").onchange = e => {
        targetLanguages[0] = e.target.value
        twpConfig.set("targetLanguages", targetLanguages)
        if (targetLanguages.indexOf(twpConfig.get("targetLanguage")) == -1) {
            twpConfig.set("targetLanguage", targetLanguages[0])
        }
        if (targetLanguages.indexOf(twpConfig.get("targetLanguageTextTranslation")) == -1) {
            twpConfig.set("targetLanguageTextTranslation", targetLanguages[0])
        }
    }


    // Never translate these languages

    function createNodeToNeverTranslateLangsList(langCode, langName) {
        const li = document.createElement("li")
        li.setAttribute("class", "w3-display-container")
        li.value = langCode
        li.textContent = langName

        const close = document.createElement("span")
        close.setAttribute("class", "w3-button w3-transparent w3-display-right")
        close.innerHTML = "&times;"

        close.onclick = e => {
            e.preventDefault()

            twpConfig.removeLangFromNeverTranslate(langCode)
            li.remove()
        }

        li.appendChild(close)

        return li
    }

    const neverTranslateLangs = twpConfig.get("neverTranslateLangs")
    neverTranslateLangs.forEach(langCode => {
        const langName = twpLang.codeToLanguage(langCode)
        const li = createNodeToNeverTranslateLangsList(langCode, langName)
        $("#neverTranslateLangs").appendChild(li)
    })

    $("#addToNeverTranslateLangs").onchange = e => {
        const langCode = e.target.value
        const langName = twpLang.codeToLanguage(langCode)
        const li = createNodeToNeverTranslateLangsList(langCode, langName)
        $("#neverTranslateLangs").appendChild(li)

        twpConfig.addLangToNeverTranslate(langCode)
    }

    // Always translate these languages

    function createNodeToAlwaysTranslateLangsList(langCode, langName) {
        const li = document.createElement("li")
        li.setAttribute("class", "w3-display-container")
        li.value = langCode
        li.textContent = langName

        const close = document.createElement("span")
        close.setAttribute("class", "w3-button w3-transparent w3-display-right")
        close.innerHTML = "&times;"

        close.onclick = e => {
            e.preventDefault()

            twpConfig.removeLangFromAlwaysTranslate(langCode)
            li.remove()
        }

        li.appendChild(close)

        return li
    }

    const alwaysTranslateLangs = twpConfig.get("alwaysTranslateLangs")
    alwaysTranslateLangs.forEach(langCode => {
        const langName = twpLang.codeToLanguage(langCode)
        const li = createNodeToAlwaysTranslateLangsList(langCode, langName)
        $("#alwaysTranslateLangs").appendChild(li)
    })

    $("#addToAlwaysTranslateLangs").onchange = e => {
        const langCode = e.target.value
        const langName = twpLang.codeToLanguage(langCode)
        const li = createNodeToAlwaysTranslateLangsList(langCode, langName)
        $("#alwaysTranslateLangs").appendChild(li)

        twpConfig.addLangToAlwaysTranslate(langCode)
    }


    // Always translate these Sites

    function createNodeToAlwaysTranslateSitesList(hostname) {
        const li = document.createElement("li")
        li.setAttribute("class", "w3-display-container")
        li.value = hostname
        li.textContent = hostname

        const close = document.createElement("span")
        close.setAttribute("class", "w3-button w3-transparent w3-display-right")
        close.innerHTML = "&times;"

        close.onclick = e => {
            e.preventDefault()

            twpConfig.removeSiteFromAlwaysTranslate(hostname)
            li.remove()
        }

        li.appendChild(close)

        return li
    }

    const alwaysTranslateSites = twpConfig.get("alwaysTranslateSites")
    alwaysTranslateSites.forEach(hostname => {
        const li = createNodeToAlwaysTranslateSitesList(hostname)
        $("#alwaysTranslateSites").appendChild(li)
    })

    $("#addToAlwaysTranslateSites").onclick = e => {
        const hostname = prompt("Enter the site hostname", "www.site.com")
        if (!hostname) return;

        const li = createNodeToAlwaysTranslateSitesList(hostname)
        $("#alwaysTranslateSites").appendChild(li)

        twpConfig.addSiteToAlwaysTranslate(hostname)
    }

    // Never translate these Sites

    function createNodeToNeverTranslateSitesList(hostname) {
        const li = document.createElement("li")
        li.setAttribute("class", "w3-display-container")
        li.value = hostname
        li.textContent = hostname

        const close = document.createElement("span")
        close.setAttribute("class", "w3-button w3-transparent w3-display-right")
        close.innerHTML = "&times;"

        close.onclick = e => {
            e.preventDefault()

            twpConfig.removeSiteFromNeverTranslate(hostname)
            li.remove()
        }

        li.appendChild(close)

        return li
    }

    const neverTranslateSites = twpConfig.get("neverTranslateSites")
    neverTranslateSites.forEach(hostname => {
        const li = createNodeToNeverTranslateSitesList(hostname)
        $("#neverTranslateSites").appendChild(li)
    })

    $("#addToNeverTranslateSites").onclick = e => {
        const hostname = prompt("Enter the site hostname", "www.site.com")
        if (!hostname) return;

        const li = createNodeToNeverTranslateSitesList(hostname)
        $("#neverTranslateSites").appendChild(li)

        twpConfig.addSiteToNeverTranslate(hostname)
    }

    function createNodeToSpecialRulesList(hostname) {
        const li = document.createElement("li")
        li.setAttribute("class", "w3-display-container")
        li.value = hostname
        li.textContent = hostname

        const close = document.createElement("span")
        close.setAttribute("class", "w3-button w3-transparent w3-display-right")
        close.innerHTML = "&times;"

        close.onclick = e => {
            e.preventDefault()

            twpConfig.removeRuleFromSpecialRules(hostname)
            li.remove()
        }

        li.appendChild(close)

        return li
    }
    const specialRules = twpConfig.get("specialRules")
    specialRules.forEach(hostname => {
        const li = createNodeToSpecialRulesList(hostname)
        $("#specialRules").appendChild(li)
    })

    $("#addToSpecialRules").onclick = e => {

        const rule = document.querySelector("#specialRule").value
        if (!rule) return;

        // check rule is valid
        // it must an valid json object 
        
        try{
          const ruleObj = JSON.parse(rule)
        }catch(e){
          alert("Invalid rule, it should be an json object string")
          return
        }
        const li = createNodeToSpecialRulesList(rule)
        $("#specialRules").appendChild(li)
        // clean textarea
        document.querySelector("#specialRule").value = ""

        twpConfig.addRuleToSpecialRules(rule)
    }
    function createcustomDictionary(keyWord,customValue) {
        const li = document.createElement("li")
        li.setAttribute("class", "w3-display-container")
        li.value = keyWord
        if(customValue !== ''){
            li.textContent = keyWord + " ------------------- " + customValue
        }
        else{
            li.textContent = keyWord
        }
        const close = document.createElement("span")
        close.setAttribute("class", "w3-button w3-transparent w3-display-right")
        close.innerHTML = "&times;"

        close.onclick = e => {
            e.preventDefault()
            twpConfig.removeKeyWordFromcustomDictionary(keyWord)
            li.remove()
        }
        li.appendChild(close)
        return li
    }

    let customDictionary = twpConfig.get("customDictionary")
    customDictionary = new Map([...customDictionary.entries()].sort((a, b) => String(b[0]).length - String(a[0]).length))
    customDictionary.forEach(function(customValue,keyWord){
        const li = createcustomDictionary(keyWord,customValue)
        $("#customDictionary").appendChild(li)
    });

    $("#addToCustomDictionary").onclick = e => {
        let keyWord = prompt("Enter the keyWord, Minimum two letters ", "")
        keyWord = keyWord.trim().toLowerCase()
        if (!keyWord || keyWord.length < 2) return
        let customValue = prompt("(Optional)\nYou can enter a value to replace it , or fill in nothing.", "")
        if (!customValue) customValue = ''
        customValue = customValue.trim()
        const li = createcustomDictionary(keyWord,customValue)
        $("#customDictionary").appendChild(li)
        twpConfig.addKeyWordTocustomDictionary(keyWord,customValue)
    }

    // translations options
    $("#pageTranslatorService").onchange = e => {
        twpConfig.set("pageTranslatorService", e.target.value)
    }
    $("#pageTranslatorService").value = twpConfig.get("pageTranslatorService")


    $("#translateTag_pre").onchange = e => {
        twpConfig.set("translateTag_pre", e.target.value)
    }
    $("#translateTag_pre").value = twpConfig.get("translateTag_pre")


    $("#dontSortResults").onchange = e => {
        twpConfig.set("dontSortResults", e.target.value)
    }
    $("#dontSortResults").value = twpConfig.get("dontSortResults")

    $("#translateDynamicallyCreatedContent").onchange = e => {
        twpConfig.set("translateDynamicallyCreatedContent", e.target.value)
    }
    $("#translateDynamicallyCreatedContent").value = twpConfig.get("translateDynamicallyCreatedContent")

    $("#autoTranslateWhenClickingALink").onchange = e => {
        if (e.target.value == "yes") {
            chrome.permissions.request({
                permissions: ["webNavigation"]
            }, granted => {
                if (granted) {
                    twpConfig.set("autoTranslateWhenClickingALink", "yes")
                } else {
                    twpConfig.set("autoTranslateWhenClickingALink", "no")
                    e.target.value = "no"
                }
            })
        } else {
            twpConfig.set("autoTranslateWhenClickingALink", "no")
            chrome.permissions.remove({
                permissions: ["webNavigation"]
            })
        }
    }
    $("#autoTranslateWhenClickingALink").value = twpConfig.get("autoTranslateWhenClickingALink")


    function enableOrDisableTranslateSelectedAdvancedOptions(value) {
        if (value === "no") {
            document.querySelectorAll("#translateSelectedAdvancedOptions input").forEach(input => {
                input.setAttribute("disabled", "")
            })
        } else {
            document.querySelectorAll("#translateSelectedAdvancedOptions input").forEach(input => {
                input.removeAttribute("disabled")
            })
        }
    }



    $("#isShowDualLanguage").onchange = e => {
        twpConfig.set("isShowDualLanguage", e.target.value)
    }
    $("#saveCustomDualStyle").onclick = e => {
       const customDualStyle = $("#customDualStyle").value;
       twpConfig.set("customDualStyle", customDualStyle)
    }
    if(twpConfig.get("customDualStyle") !== "") {
      $("#customDualStyle").value = twpConfig.get("customDualStyle")
    }
    $("#isShowDualLanguage").value = twpConfig.get("isShowDualLanguage")
    $("#dualStyle").onchange = e => {
        twpConfig.set("dualStyle", e.target.value)
    }
    $("#dualStyle").value = twpConfig.get("dualStyle")


    // Reading and native shortcut controls live in reading-options.js.

    // storage options
    $("#deleteTranslationCache").onclick = e => {
        if (confirm(chrome.i18n.getMessage("doYouWantToDeleteTranslationCache"))) {
            chrome.runtime.sendMessage({
                action: "deleteTranslationCache",
                reload: true
            })
        }
    }

    $("#backupToFile").onclick = e => {
        const configJSON = twpConfig.export()

        const element = document.createElement('a')
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(configJSON))
        element.setAttribute('download', 'immersive-translate-backup_' + new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/\:/g, ".") + ".txt")

        element.style.display = 'none'
        document.body.appendChild(element)

        element.click()

        document.body.removeChild(element)
    }
    $("#restoreFromFile").onclick = e => {
        const element = document.createElement('input')
        element.setAttribute('type', 'file')
        element.setAttribute('accept', 'text/plain')

        element.style.display = 'none'
        document.body.appendChild(element)

        element.oninput = e => {
            const input = e.target

            const reader = new FileReader()
            reader.onload = function () {
                try {
                    if (confirm(chrome.i18n.getMessage("doYouWantOverwriteAllSettings"))) {
                        twpConfig.import(reader.result)
                    }
                } catch (e) {
                    alert(chrome.i18n.getMessage("fileIsCorrupted"))
                    console.error(e)
                }
            }

            reader.readAsText(input.files[0])
        }

        element.click()

        document.body.removeChild(element)
    }
    $("#resetToDefault").onclick = e => {
        if (confirm(chrome.i18n.getMessage("doYouWantRestoreSettings"))) {
            twpConfig.restoreToDefault()
        }
    }


    $("#showPopupMobile").onchange = e => {
        twpConfig.set("showPopupMobile", e.target.value)
    }
    $("#showPopupMobile").value = twpConfig.get("showPopupMobile")

    $("#isTranslateTitle").onchange = e => {
        twpConfig.set("isTranslateTitle", e.target.value)
    }
    $("#isTranslateTitle").value = twpConfig.get("isTranslateTitle")

    $("#showTranslatePageContextMenu").onchange = e => {
        twpConfig.set("showTranslatePageContextMenu", e.target.value)
    }
    $("#showTranslatePageContextMenu").value = twpConfig.get("showTranslatePageContextMenu")

    $("#showButtonInTheAddressBar").onchange = e => {
        twpConfig.set("showButtonInTheAddressBar", e.target.value)
    }
    $("#showButtonInTheAddressBar").value = twpConfig.get("showButtonInTheAddressBar")

    $("#translateClickingOnce").onchange = e => {
        twpConfig.set("translateClickingOnce", e.target.value)
    }
    $("#translateClickingOnce").value = twpConfig.get("translateClickingOnce")



    $("#btnCalculateStorage").style.display = "inline-block"
    $("#storageUsed").style.display = "none"
    $("#btnCalculateStorage").onclick = e => {
        $("#btnCalculateStorage").style.display = "none"

        chrome.runtime.sendMessage({
            action: "getCacheSize"
        }, result => {
            $("#storageUsed").textContent = result
            $("#storageUsed").style.display = "inline-block"
        })
    }

    // if (navigator.language === "pt-BR") {
    //     $("#currency").value = "BRL"
    //     $("#donateInUSD").style.display = "none"
    // } else {
    //     $("#currency").value = "USD"
    //     $("#donateInBRL").style.display = "none"
    // }

    // $("#currency").onchange = e => {
    //     if (e.target.value === "BRL") {
    //         $("#donateInUSD").style.display = "none"
    //         $("#donateInBRL").style.display = "block"
    //     } else {
    //         $("#donateInUSD").style.display = "block"
    //         $("#donateInBRL").style.display = "none"
    //     }
    // }
})

window.scrollTo({
    top: 0
})

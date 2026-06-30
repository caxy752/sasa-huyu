import React from 'react';
import debounce from 'debounce';
import { observer } from 'mobx-react-lite';
import { DEBOUNCE_INTERVAL_TIME } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { rudderStackSendTutorialSearchEvent } from '../../../../analytics/rudderstack-tutorials';

type TSearchInput = {
    faq_value: string;
    setFaqSearchContent: (value: string) => void;
    prev_active_tutorials: number;
};

const SearchInput = observer(({ faq_value, setFaqSearchContent, prev_active_tutorials }: TSearchInput) => {
    const { dashboard } = useStore();
    const input_ref = React.useRef(null);
    const { setActiveTabTutorial, filterTuotrialTab } = dashboard;

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const debounceChange = React.useCallback(
        debounce(
            value => {
                filterTuotrialTab(value);
                setActiveTabTutorial(3);
                rudderStackSendTutorialSearchEvent({ search_term: value });
                if (value === '') {
                    setActiveTabTutorial(prev_active_tutorials);
                }
            },
            DEBOUNCE_INTERVAL_TIME,
            {
                trailing: true,
                leading: false,
            }
        ),
        []
    );
    const onSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
        setFaqSearchContent(event.target.value);
        debounceChange(event.target.value);
    };

    React.useEffect(() => {
        // Nuclear option - force white border and watch for Chrome changes
        if (input_ref.current) {
            const input = input_ref.current as HTMLInputElement;

            // Remove all validation
            input.removeAttribute('required');
            input.removeAttribute('pattern');
            input.setAttribute('novalidate', '');
            input.setAttribute('formnovalidate', '');
            input.setAttribute('autocomplete', 'off');

            // Force white border function - nuclear option
            const forceWhite = () => {
                if (input) {
                    // Remove any red from computed styles
                    const computed = window.getComputedStyle(input);
                    if (computed.borderColor && computed.borderColor.includes('rgb')) {
                        // Force white
                        input.style.setProperty('border', '1px solid #ffffff', 'important');
                        input.style.setProperty('border-color', '#ffffff', 'important');
                        input.style.setProperty('border-top-color', '#ffffff', 'important');
                        input.style.setProperty('border-right-color', '#ffffff', 'important');
                        input.style.setProperty('border-bottom-color', '#ffffff', 'important');
                        input.style.setProperty('border-left-color', '#ffffff', 'important');
                        input.style.setProperty('outline', 'none', 'important');
                        input.style.setProperty('outline-color', 'transparent', 'important');
                        input.style.setProperty('box-shadow', 'none', 'important');
                        input.style.setProperty('-webkit-box-shadow', 'none', 'important');
                    }
                    // Always force white regardless
                    input.style.setProperty('border', '1px solid #ffffff', 'important');
                    input.style.setProperty('border-color', '#ffffff', 'important');
                    input.style.setProperty('outline', 'none', 'important');
                    input.style.setProperty('box-shadow', 'none', 'important');
                }
            };

            // Force immediately
            forceWhite();

            // Watch for style changes (Chrome validation)
            const observer = new MutationObserver(() => {
                forceWhite();
            });

            observer.observe(input, {
                attributes: true,
                attributeFilter: ['style', 'class'],
                subtree: false,
            });

            // Force every 50ms
            const interval = setInterval(forceWhite, 50);

            // Force on all events
            const events = ['focus', 'blur', 'input', 'change', 'keyup', 'keydown', 'click'];
            events.forEach(event => {
                input.addEventListener(event, forceWhite, true);
            });

            return () => {
                clearInterval(interval);
                observer.disconnect();
                events.forEach(event => {
                    input.removeEventListener(event, forceWhite, true);
                });
            };
        }
    }, [faq_value]);

    return (
        <>
            <input
                ref={input_ref}
                data-testid='id-test-input-search'
                type='text'
                placeholder={localize('Search')}
                className='dc-tabs__wrapper__group__search-input'
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => onSearch(event)}
                value={faq_value}
                autoComplete='off'
                formNoValidate
                style={{
                    border: '1px solid #ffffff',
                    borderColor: '#ffffff',
                    outline: 'none',
                    boxShadow: 'none',
                    WebkitBoxShadow: 'none',
                }}
            />
        </>
    );
});

export default SearchInput;

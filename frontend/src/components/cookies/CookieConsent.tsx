import { 
    List, 
    Modal, 
    Header, 
    Icon, 
    Button 
} from "semantic-ui-react";

export const CookieConsentDialog = ({accepted, setAccepted}:{accepted: boolean, setAccepted: () => any}) => {

    return (
        <Modal
            basic
            open={accepted}
            size='small'
        >
            <Header icon>
                <Icon name='archive' />
                Archive Old Messages
            </Header>
            <Modal.Content>
                <p>
                This website uses cookies to enhance the user experience and help us refine OpenContracts.
                We do not monetize (sell) your information. Please accept the cookie to continue.
                </p>
                <Header as='h2' icon textAlign='center'>
                    <Icon name='info circle' circular />
                    <Header.Content>What We Collect</Header.Content>
                </Header>
                <List>
                    <List.Item>
                        <List.Icon name='users' />
                        <List.Content>Login Information (email, name, ip)</List.Content>
                    </List.Item>
                    <List.Item>
                        <List.Icon name='settings' />
                        <List.Content>Usage Information</List.Content>
                    </List.Item>
                    <List.Item>
                        <List.Icon name='computer' />
                        <List.Content>System Information</List.Content>
                    </List.Item>
                </List>
            </Modal.Content>
            <Modal.Actions>
                <Button color='green' inverted onClick={() => setAccepted()}>
                    <Icon name='checkmark' /> Accept
                </Button>
            </Modal.Actions>
        </Modal>
    );

}
